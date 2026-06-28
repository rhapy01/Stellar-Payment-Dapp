# Stellar Pay — Simple Payment dApp

A beginner-friendly Stellar payment dApp for **White Belt Level 1**. Connect your [Freighter](https://www.freighter.app/) wallet, view your XLM balance on **Stellar Testnet**, and send payments to any address.

## Live Deployment (Testnet)

**🚀 Live URL:** [https://stellar-payment-dapp.vercel.app](https://stellar-payment-dapp.vercel.app)

The app is deployed on **Vercel** and connects to **Stellar Testnet** via the Horizon API at `https://horizon-testnet.stellar.org`.

### Proof of Deployment

| Wallet Connected | Balance Displayed | Transaction Successful |
| --- | --- | --- |
| ![Wallet connected](docs/screenshots/wallet-connected.png) | ![Balance displayed](docs/screenshots/balance-displayed.png) | ![Successful transaction](docs/screenshots/transaction-success.png) |

> Screenshots show the live dApp at [https://stellar-payment-dapp.vercel.app](https://stellar-payment-dapp.vercel.app) with Freighter connected on Testnet, XLM balance loaded, and a successful payment transaction recorded on Stellar Expert.

**Sample successful testnet transaction:**
[View on Stellar Expert →](https://stellar.expert/explorer/testnet)

**Repository:** [https://github.com/rhapy01/Stellar-Payment-Dapp](https://github.com/rhapy01/Stellar-Payment-Dapp)

---

## Features

- **Wallet connection** — Connect and disconnect Freighter with clear connection status
- **Balance display** — Fetch and show the connected wallet's native XLM balance (with refresh)
- **Send payments** — Transfer XLM on testnet with recipient address and amount inputs
- **Transaction feedback** — Loading state, success with explorer link, and clear error messages
- **Input validation** — Stellar address format, positive amounts, and balance checks

---

## Wallet Integration

The wallet integration uses `@stellar/freighter-api` v6 and `@stellar/stellar-sdk` v15.

Source files (also mirrored at `src/` in the repo root for easy browsing):
- [`src/pages/Home.tsx`](./src/pages/Home.tsx) — main dApp UI with all wallet logic
- [`src/App.tsx`](./src/App.tsx) — app entry with router and providers
- [`src/lib/stellar-errors.ts`](./src/lib/stellar-errors.ts) — Horizon error mapping

```ts
import freighter from "@stellar/freighter-api";
import { Horizon, TransactionBuilder, Networks, Asset, Operation, BASE_FEE } from "@stellar/stellar-sdk";
```

### What each Freighter API call does

| Feature | API call | Function in `Home.tsx` |
|---|---|---|
| Detect Freighter installed | `freighter.isConnected()` | `checkConnection()` |
| Request wallet access / connect | `freighter.requestAccess()` | `connectWallet()` |
| Get connected public key | `freighter.getAddress()` | `checkConnection()` |
| Check active network | `freighter.getNetwork()` | `checkWalletNetwork()` |
| Fetch XLM balance | `new Horizon.Server(...).loadAccount()` | `fetchBalance()` |
| Sign transaction (XDR) | `freighter.signTransaction(xdr, { networkPassphrase })` | `onSubmit()` |
| Submit signed transaction | `server.submitTransaction(signedTx)` | `onSubmit()` |

### Connect wallet flow

```ts
// 1. Check Freighter is installed
const { isConnected: hasFreighter } = await freighter.isConnected();

// 2. Request permission and get public key
const result = await freighter.requestAccess();
setPublicKey(result.address);

// 3. Confirm wallet is on Testnet
const { network } = await freighter.getNetwork();
// network === "TESTNET" ✓
```

### Send payment flow

```ts
// Build transaction
const transaction = new TransactionBuilder(sourceAccount, {
  fee: BASE_FEE,
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(Operation.payment({
    destination: recipientAddress,
    asset: Asset.native(),
    amount: xlmAmount,
  }))
  .setTimeout(30)
  .build();

// Sign with Freighter
const signResult = await freighter.signTransaction(transaction.toXDR(), {
  networkPassphrase: Networks.TESTNET,
  address: publicKey,
});

// Submit to Horizon testnet
const signedTx = TransactionBuilder.fromXDR(signResult.signedTxXdr, Networks.TESTNET);
const result = await server.submitTransaction(signedTx);
// result.hash → link to stellar.expert/explorer/testnet/tx/<hash>
```

---

## Project Structure

```
├── src/                           ← mirror of key app source files (root level)
│   ├── pages/Home.tsx             ← main dApp: wallet connect, balance, payments
│   ├── App.tsx                    ← router and providers
│   ├── main.tsx                   ← React entry point
│   └── lib/stellar-errors.ts      ← Horizon error code mapping
│
└── artifacts/stellar-dapp/        ← full React app (build root)
    ├── src/                       ← same source files (canonical location)
    │   ├── pages/Home.tsx
    │   ├── App.tsx
    │   ├── lib/stellar-errors.ts
    │   └── components/ui/         ← shadcn/ui components
    ├── package.json               ← @stellar/freighter-api, @stellar/stellar-sdk
    └── vite.config.ts
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- [Freighter browser extension](https://www.freighter.app/) installed and set to **Testnet**
- Testnet XLM ([Stellar testnet faucet](https://laboratory.stellar.org/#account-creator?network=test))

## Setup

```bash
git clone https://github.com/rhapy01/Stellar-Payment-Dapp.git
cd Stellar-Payment-Dapp
pnpm install
pnpm --filter @workspace/stellar-dapp dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build & deploy

```bash
pnpm --filter @workspace/stellar-dapp build
npx vercel --prod --archive=tgz
```

---

## Tech Stack

- React 18 + TypeScript + Vite
- [`@stellar/freighter-api`](https://www.npmjs.com/package/@stellar/freighter-api) v6 — Freighter wallet integration
- [`@stellar/stellar-sdk`](https://www.npmjs.com/package/@stellar/stellar-sdk) v15 — Horizon API and transaction building
- Tailwind CSS + shadcn/ui

## License

MIT
