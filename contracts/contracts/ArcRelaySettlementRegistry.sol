// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @title ArcRelaySettlementRegistry
/// @notice An on-chain, EIP-712-signed audit trail for x402 nanopayments
///         settled through ArcRelay. Complementary to Circle Gateway's own
///         batched settlement — Gateway moves the USDC, this contract gives
///         ArcRelay a permanent, independently verifiable record of *which*
///         agent paid *which* resource *how much*, without trusting
///         ArcRelay's own backend to have logged it honestly.
/// @dev    Payers (agent wallets) sign a `Settlement` struct off-chain;
///         anyone can submit it on-chain via `recordSettlement`. Replay is
///         prevented per-payer via an incrementing nonce set, matching the
///         EIP-3009 / permit-style pattern this system already uses for
///         payment authorization, applied here to settlement *logging*
///         rather than the transfer itself.
contract ArcRelaySettlementRegistry is EIP712 {
    using ECDSA for bytes32;

    struct Settlement {
        address payer;
        address payee;
        uint256 amount; // USDC atomic units (6 decimals)
        bytes32 resourceId; // keccak256 of the resource path/nodeId, e.g. keccak256("sec_data_node")
        uint256 nonce;
        uint256 deadline;
    }

    bytes32 private constant SETTLEMENT_TYPEHASH = keccak256(
        "Settlement(address payer,address payee,uint256 amount,bytes32 resourceId,uint256 nonce,uint256 deadline)"
    );

    /// @notice payer => nonce => used
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    /// @notice Running totals, useful for a lightweight on-chain dashboard
    ///         read without needing an indexer for basic figures.
    uint256 public totalSettlements;
    uint256 public totalVolumeAtomicUsdc;

    event SettlementRecorded(
        bytes32 indexed settlementId,
        address indexed payer,
        address indexed payee,
        uint256 amount,
        bytes32 resourceId,
        uint256 nonce,
        uint256 timestamp
    );

    error SettlementExpired(uint256 deadline, uint256 blockTimestamp);
    error NonceAlreadyUsed(address payer, uint256 nonce);
    error InvalidSignature();
    error ZeroAddress();

    constructor() EIP712("ArcRelaySettlementRegistry", "1") {}

    /// @notice Records a settlement on-chain given the payer's EIP-712
    ///         signature over the `Settlement` struct. Callable by anyone
    ///         holding a valid signature (typically ArcRelay's orchestrator
    ///         or the sub-agent node itself, immediately after Gateway
    ///         confirms settlement) — the signature is what's trusted, not
    ///         the caller.
    function recordSettlement(Settlement calldata s, bytes calldata signature)
        external
        returns (bytes32 settlementId)
    {
        if (s.payer == address(0) || s.payee == address(0)) revert ZeroAddress();
        if (block.timestamp > s.deadline) revert SettlementExpired(s.deadline, block.timestamp);
        if (usedNonces[s.payer][s.nonce]) revert NonceAlreadyUsed(s.payer, s.nonce);

        bytes32 structHash = keccak256(
            abi.encode(SETTLEMENT_TYPEHASH, s.payer, s.payee, s.amount, s.resourceId, s.nonce, s.deadline)
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);
        if (signer != s.payer) revert InvalidSignature();

        usedNonces[s.payer][s.nonce] = true;
        totalSettlements += 1;
        totalVolumeAtomicUsdc += s.amount;

        settlementId = keccak256(abi.encode(s.payer, s.nonce, block.chainid, address(this)));

        emit SettlementRecorded(
            settlementId, s.payer, s.payee, s.amount, s.resourceId, s.nonce, block.timestamp
        );
    }

    /// @notice Returns the EIP-712 domain separator, useful for off-chain
    ///         signers (e.g. viem's `signTypedData`) to confirm they're
    ///         signing against the exact deployed instance/chain.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
