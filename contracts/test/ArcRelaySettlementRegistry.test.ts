import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import type { ArcRelaySettlementRegistry } from "../typechain-types";

describe("ArcRelaySettlementRegistry", () => {
  async function deployFixture() {
    const [deployer, payer, payee, stranger] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("ArcRelaySettlementRegistry");
    const registry = (await Registry.deploy()) as unknown as ArcRelaySettlementRegistry;
    await registry.waitForDeployment();
    return { registry, deployer, payer, payee, stranger };
  }

  async function signSettlement(
    registry: ArcRelaySettlementRegistry,
    signer: Awaited<ReturnType<typeof ethers.getSigners>>[number],
    settlement: {
      payer: string;
      payee: string;
      amount: bigint;
      resourceId: string;
      nonce: bigint;
      deadline: bigint;
    }
  ) {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const domain = {
      name: "ArcRelaySettlementRegistry",
      version: "1",
      chainId,
      verifyingContract: await registry.getAddress(),
    };
    const types = {
      Settlement: [
        { name: "payer", type: "address" },
        { name: "payee", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "resourceId", type: "bytes32" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };
    return signer.signTypedData(domain, types, settlement);
  }

  it("records a validly-signed settlement, emits SettlementRecorded, and updates totals", async () => {
    const { registry, payer, payee } = await deployFixture();
    const resourceId = ethers.keccak256(ethers.toUtf8Bytes("sec_data_node"));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const settlement = {
      payer: payer.address,
      payee: payee.address,
      amount: 300n, // 0.0003 USDC, atomic units
      resourceId,
      nonce: 1n,
      deadline,
    };
    const signature = await signSettlement(registry, payer, settlement);

    await expect(registry.recordSettlement(settlement, signature))
      .to.emit(registry, "SettlementRecorded")
      .withArgs(
        anyValue, // settlementId — deterministic on-chain, not worth re-deriving here
        payer.address,
        payee.address,
        300n,
        resourceId,
        1n,
        anyValue // block timestamp
      );

    expect(await registry.totalSettlements()).to.equal(1n);
    expect(await registry.totalVolumeAtomicUsdc()).to.equal(300n);
    expect(await registry.usedNonces(payer.address, 1n)).to.equal(true);
  });

  it("rejects a replayed nonce", async () => {
    const { registry, payer, payee } = await deployFixture();
    const resourceId = ethers.keccak256(ethers.toUtf8Bytes("sentiment_node"));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const settlement = { payer: payer.address, payee: payee.address, amount: 200n, resourceId, nonce: 7n, deadline };
    const signature = await signSettlement(registry, payer, settlement);

    await registry.recordSettlement(settlement, signature);
    await expect(registry.recordSettlement(settlement, signature)).to.be.revertedWithCustomError(
      registry,
      "NonceAlreadyUsed"
    );
  });

  it("rejects a settlement signed by the wrong key", async () => {
    const { registry, payer, payee, stranger } = await deployFixture();
    const resourceId = ethers.keccak256(ethers.toUtf8Bytes("solidity_audit_node"));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const settlement = { payer: payer.address, payee: payee.address, amount: 500n, resourceId, nonce: 1n, deadline };

    // Signed by `stranger`, but the struct claims `payer` authorized it.
    const signature = await signSettlement(registry, stranger, settlement);

    await expect(registry.recordSettlement(settlement, signature)).to.be.revertedWithCustomError(
      registry,
      "InvalidSignature"
    );
  });

  it("rejects an expired settlement", async () => {
    const { registry, payer, payee } = await deployFixture();
    const resourceId = ethers.keccak256(ethers.toUtf8Bytes("liquidity_router_node"));
    const expiredDeadline = BigInt(Math.floor(Date.now() / 1000) - 10);
    const settlement = {
      payer: payer.address,
      payee: payee.address,
      amount: 400n,
      resourceId,
      nonce: 1n,
      deadline: expiredDeadline,
    };
    const signature = await signSettlement(registry, payer, settlement);

    await expect(registry.recordSettlement(settlement, signature)).to.be.revertedWithCustomError(
      registry,
      "SettlementExpired"
    );
  });

  it("accumulates totals across multiple payers", async () => {
    const { registry, payer, payee, stranger } = await deployFixture();
    const resourceId = ethers.keccak256(ethers.toUtf8Bytes("sec_data_node"));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const s1 = { payer: payer.address, payee: payee.address, amount: 300n, resourceId, nonce: 1n, deadline };
    const s2 = { payer: stranger.address, payee: payee.address, amount: 500n, resourceId, nonce: 1n, deadline };

    await registry.recordSettlement(s1, await signSettlement(registry, payer, s1));
    await registry.recordSettlement(s2, await signSettlement(registry, stranger, s2));

    expect(await registry.totalSettlements()).to.equal(2n);
    expect(await registry.totalVolumeAtomicUsdc()).to.equal(800n);
  });
});
