import { ethers, network } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No signer configured. Set ARCRELAY_PRIVATE_KEY in contracts/.env before deploying."
    );
  }

  console.log(`Deploying ArcRelaySettlementRegistry to "${network.name}" as ${deployer.address}...`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Deployer balance: ${ethers.formatEther(balance)} (native gas token)`);

  const Registry = await ethers.getContractFactory("ArcRelaySettlementRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  const deployTx = registry.deploymentTransaction();

  console.log("\nArcRelaySettlementRegistry deployed:");
  console.log(`  address: ${address}`);
  console.log(`  tx hash: ${deployTx?.hash}`);
  console.log(`  explorer: https://testnet.arcscan.app/address/${address}`);
  console.log(
    `\nVerify with:\n  npm run verify:arc-testnet -- ${address}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
