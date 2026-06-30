# Contracts

## Why there is no custom smart contract

Stellar native XLM payments **do not require a custom smart contract**. XLM transfers are handled by the **Stellar network's built-in `Payment` operation**, which is part of the core protocol.

This is by design — Stellar's architecture separates simple payments (built into the protocol) from programmable logic (Soroban smart contracts, introduced in a later level).

For **White Belt Level 1**, the official requirements are:

| Requirement | Status |
|---|---|
| Set up Freighter wallet on Testnet | ✅ |
| Implement wallet connect / disconnect | ✅ |
| Fetch and display XLM balance | ✅ |
| Send an XLM transaction on Testnet | ✅ |
| Show success / failure feedback with tx hash | ✅ |
| Deploy a smart contract | ❌ Not required |

## How the payment operation works

Instead of a smart contract, this dApp uses `@stellar/stellar-sdk` to build and submit a native `Payment` operation:

```ts
import { TransactionBuilder, Networks, Asset, Operation, BASE_FEE } from "@stellar/stellar-sdk";

const transaction = new TransactionBuilder(sourceAccount, {
  fee: BASE_FEE,
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(
    Operation.payment({
      destination: recipientAddress,  // G... public key
      asset: Asset.native(),          // XLM
      amount: "10",                   // amount in XLM
    })
  )
  .setTimeout(30)
  .build();

// Sign with Freighter wallet
const signResult = await freighter.signTransaction(transaction.toXDR(), {
  networkPassphrase: Networks.TESTNET,
  address: senderPublicKey,
});

// Submit to Stellar Testnet via Horizon
const result = await server.submitTransaction(signedTx);
// result.hash → confirmed on-chain transaction ID
```

## Confirmed testnet transaction

This transaction was executed through the live app on Stellar Testnet:

- **Hash:** `af0786bbc88de5d466a7ca2b3e96d6d1f5938f817361a88237ef5927f388f1a6`
- **Explorer:** https://stellar.expert/explorer/testnet/tx/af0786bbc88de5d466a7ca2b3e96d6d1f5938f817361a88237ef5927f388f1a6
- **Network:** Stellar Testnet
- **Operation:** Payment (native XLM)

## References

- [Stellar Payment Operation docs](https://developers.stellar.org/docs/learn/fundamentals/transactions/list-of-operations#payment)
- [Stellar Testnet Horizon API](https://horizon-testnet.stellar.org)
- [Freighter API docs](https://docs.freighter.app)
