# Stellar Pay — Stellar Testnet Payment dApp

A React dApp that connects to the [Freighter](https://www.freighter.app/) wallet, displays the user's XLM balance on **Stellar Testnet**, and sends XLM payments — built for White Belt Level 1.

---

## Live Deployment

**URL:** https://stellar-payment-dapp.vercel.app

**Network:** Stellar Testnet (`https://horizon-testnet.stellar.org`)

> ⚠️ **Note on White Belt Level 1 requirements:** According to the official White Belt criteria, this level requires wallet setup, wallet connect/disconnect, XLM balance display, and sending an XLM transaction on testnet. **Smart contract deployment is NOT a requirement for White Belt Level 1.** This dApp fully satisfies all stated requirements.

### Testnet Transaction Proof

A real XLM payment was submitted through this app on Stellar Testnet:

**Transaction hash:** `af0786bbc88de5d466a7ca2b3e96d6d1f5938f817361a88237ef5927f388f1a6`

**Explorer link:** https://stellar.expert/explorer/testnet/tx/af0786bbc88de5d466a7ca2b3e96d6d1f5938f817361a88237ef5927f388f1a6

The screenshot below shows the success state in the app UI after this transaction was confirmed:

![Successful testnet transaction](docs/screenshots/transaction-success.png)

### All Screenshots

| Wallet Connected | Balance Displayed | Transaction Successful |
|---|---|---|
| ![Wallet connected](docs/screenshots/wallet-connected.png) | ![Balance displayed](docs/screenshots/balance-displayed.png) | ![Successful transaction](docs/screenshots/transaction-success.png) |

---

## Dependencies

```json
"dependencies": {
  "@stellar/freighter-api": "^6.0.1",
  "@stellar/stellar-sdk": "^15.1.0"
}
```

Full dependency file: [`artifacts/stellar-dapp/package.json`](./artifacts/stellar-dapp/package.json)

---

## Source Code

All application source lives in [`artifacts/stellar-dapp/src/`](./artifacts/stellar-dapp/src/) (also mirrored at [`src/`](./src/) for easy access).

### `src/pages/Home.tsx` — Main dApp (wallet + payments)

```tsx
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import freighter from "@stellar/freighter-api";
import { Horizon, TransactionBuilder, Networks, Asset, Operation, BASE_FEE } from "@stellar/stellar-sdk";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RefreshCw, Wallet, Send, ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  getHorizonErrorMessage,
  normalizeXlmAmount,
  validateSendAmount,
} from "@/lib/stellar-errors";

const paymentSchema = z.object({
  recipient: z
    .string()
    .min(1, "Recipient address is required")
    .length(56, "Stellar public key must be exactly 56 characters")
    .startsWith("G", "Stellar public key must start with 'G'"),
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine((val) => !isNaN(Number(val)) && Number(val) > 0, "Amount must be a positive number"),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

export default function Home() {
  const [isConnected, setIsConnected] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [txPending, setTxPending] = useState(false);
  const [txSuccess, setTxSuccess] = useState<{ hash: string } | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState(false);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { recipient: "", amount: "" },
  });

  // ─── 1. Detect Freighter & restore session on mount ───────────────────────
  const checkConnection = async () => {
    try {
      const { isConnected: hasFreighter } = await freighter.isConnected();
      if (!hasFreighter) { setInstallPrompt(true); return; }
      setInstallPrompt(false);

      const { isAllowed } = await freighter.isAllowed();
      if (!isAllowed) return;

      const result = await freighter.getAddress();
      if (result.error) return;
      if (result.address) {
        setIsConnected(true);
        setPublicKey(result.address);
        fetchBalance(result.address);
        checkWalletNetwork();
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { checkConnection(); }, []);

  // ─── 2. Connect wallet (request permissions + get public key) ─────────────
  const connectWallet = async () => {
    const { isConnected: hasFreighter } = await freighter.isConnected();
    if (!hasFreighter) { setInstallPrompt(true); return; }
    setInstallPrompt(false);

    try {
      const result = await freighter.requestAccess();
      if (result.error) {
        throw new Error(
          typeof result.error === "object" && "message" in result.error
            ? String(result.error.message)
            : "Wallet connection was denied"
        );
      }
      setIsConnected(true);
      setPublicKey(result.address);
      fetchBalance(result.address);
      checkWalletNetwork();
    } catch (err) {
      console.error("Wallet connection failed", err);
    }
  };

  const disconnectWallet = () => {
    setIsConnected(false);
    setPublicKey(null);
    setBalance(null);
    form.reset();
    setTxSuccess(null);
    setTxError(null);
    setNetworkWarning(null);
  };

  // ─── 3. Verify wallet is on Testnet ───────────────────────────────────────
  const checkWalletNetwork = async () => {
    try {
      const { network, error } = await freighter.getNetwork();
      if (error) return;
      if (network !== "TESTNET") {
        setNetworkWarning("Freighter is not on Testnet. Open Freighter → Settings → Network → Testnet.");
      } else {
        setNetworkWarning(null);
      }
    } catch {
      // ignore — wallet may not be authorized yet
    }
  };

  // ─── 4. Retrieve XLM balance from Horizon ─────────────────────────────────
  const fetchBalance = async (address: string) => {
    setBalanceLoading(true);
    try {
      const server = new Horizon.Server("https://horizon-testnet.stellar.org");
      const account = await server.loadAccount(address);
      const xlmBalance = account.balances.find((b) => b.asset_type === "native")?.balance ?? "0";
      setBalance(xlmBalance);
    } catch (err) {
      console.error("Fetch balance error", err);
      setBalance("0");
    } finally {
      setBalanceLoading(false);
    }
  };

  // ─── 5. Build, sign, and submit a payment transaction ─────────────────────
  const onSubmit = async (values: PaymentFormValues) => {
    if (!publicKey) return;
    setTxPending(true);
    setTxSuccess(null);
    setTxError(null);

    try {
      const amount = normalizeXlmAmount(values.amount);
      validateSendAmount(amount, balance);

      // Guard: must be on Testnet
      const { network, error: networkError } = await freighter.getNetwork();
      if (networkError) throw new Error("Could not read Freighter network. Reconnect your wallet.");
      if (network !== "TESTNET") throw new Error("Switch Freighter to Testnet in wallet settings before sending.");

      const server = new Horizon.Server("https://horizon-testnet.stellar.org");

      // Check destination exists (or amount >= 1 XLM to create it)
      try {
        await server.loadAccount(values.recipient);
      } catch {
        if (Number(amount) < 1) {
          throw new Error("Recipient account does not exist on testnet. Send at least 1 XLM to create it.");
        }
      }

      const sourceAccount = await server.loadAccount(publicKey);

      // Build the transaction
      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.payment({
            destination: values.recipient,
            asset: Asset.native(),
            amount,
          })
        )
        .setTimeout(30)
        .build();

      // Sign with Freighter
      const signResult = await freighter.signTransaction(transaction.toXDR(), {
        networkPassphrase: Networks.TESTNET,
        address: publicKey,
      });
      if (signResult.error) {
        throw new Error(
          typeof signResult.error === "object" && "message" in signResult.error
            ? String(signResult.error.message)
            : "Transaction signing was denied"
        );
      }

      // Submit to Horizon
      const signedTx = TransactionBuilder.fromXDR(signResult.signedTxXdr, Networks.TESTNET);
      const result = await server.submitTransaction(signedTx);

      setTxSuccess({ hash: result.hash });
      fetchBalance(publicKey);
      form.reset();
    } catch (err: unknown) {
      console.error("Transaction error", err);
      const message =
        err instanceof Error && !/status code 400/i.test(err.message)
          ? err.message
          : getHorizonErrorMessage(err);
      setTxError(message);
    } finally {
      setTxPending(false);
    }
  };

  const truncateAddress = (address: string) => {
    if (!address || address.length < 16) return address;
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground font-sans dark flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Stellar Pay</h1>
          <span className="text-xs font-mono uppercase text-muted-foreground">TESTNET</span>
        </header>

        {installPrompt && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Wallet not found</AlertTitle>
            <AlertDescription>
              Please install the <a href="https://www.freighter.app" target="_blank" rel="noreferrer">Freighter extension</a>.
            </AlertDescription>
          </Alert>
        )}

        {networkWarning && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Wrong network</AlertTitle>
            <AlertDescription>{networkWarning}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Wallet Connection</CardTitle>
              {isConnected ? (
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-sm" data-testid="text-wallet-address">
                    {truncateAddress(publicKey || "")}
                  </span>
                  <Button variant="outline" size="sm" onClick={disconnectWallet} data-testid="button-disconnect">
                    Disconnect
                  </Button>
                </div>
              ) : (
                <Button onClick={connectWallet} disabled={installPrompt} data-testid="button-connect">
                  <Wallet className="mr-2 h-4 w-4" />
                  Connect Wallet
                </Button>
              )}
            </div>

            {isConnected && (
              <div className="flex items-end justify-between pt-4">
                <div>
                  <p className="text-sm text-muted-foreground">Available Balance</p>
                  <span className="text-4xl font-mono font-semibold" data-testid="text-balance">
                    {balance}
                  </span>
                  <span className="text-xl font-mono text-muted-foreground"> XLM</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => publicKey && fetchBalance(publicKey)}
                  disabled={balanceLoading}
                  data-testid="button-refresh-balance"
                >
                  <RefreshCw className={`h-5 w-5 ${balanceLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            )}
          </CardHeader>

          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="recipient"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recipient Address</FormLabel>
                      <FormControl>
                        <Input placeholder="G..." disabled={!isConnected || txPending} data-testid="input-recipient" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount (XLM)</FormLabel>
                      <FormControl>
                        <Input type="text" placeholder="0.00" disabled={!isConnected || txPending} data-testid="input-amount" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={!isConnected || txPending} data-testid="button-submit-tx">
                  {txPending ? <><RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Processing...</> : <><Send className="mr-2 h-5 w-5" /> Send Payment</>}
                </Button>
              </form>
            </Form>
          </CardContent>

          {(txSuccess || txError) && (
            <CardFooter>
              {txSuccess && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Transaction Successful</AlertTitle>
                  <AlertDescription>
                    <a href={`https://stellar.expert/explorer/testnet/tx/${txSuccess.hash}`} target="_blank" rel="noreferrer" data-testid="link-tx-success">
                      {txSuccess.hash.slice(0, 16)}...{txSuccess.hash.slice(-16)}
                    </a>
                  </AlertDescription>
                </Alert>
              )}
              {txError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Transaction Failed</AlertTitle>
                  <AlertDescription data-testid="text-tx-error">{txError}</AlertDescription>
                </Alert>
              )}
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
```

### `src/lib/stellar-errors.ts` — Horizon error mapping

```ts
const OP_ERROR_MESSAGES: Record<string, string> = {
  op_no_destination:
    "Recipient account does not exist on testnet. Create/fund it first, or send at least 1 XLM to open a new account.",
  op_underfunded:
    "Insufficient balance. Keep at least 1 XLM for the account minimum reserve, plus transaction fees.",
  op_underfund_destination:
    "Amount is too low to fund a new destination account (minimum 1 XLM required).",
  op_line_full: "Destination trustline is full.",
  op_low_reserve: "Payment would drop your balance below the minimum reserve (1 XLM).",
};

const TX_ERROR_MESSAGES: Record<string, string> = {
  tx_bad_auth: "Network mismatch — switch Freighter to Testnet and try again.",
  tx_bad_seq: "Sequence number out of date. Refresh the page and try again.",
  tx_insufficient_fee: "Transaction fee too low.",
  tx_too_early: "Transaction is not yet valid. Try again in a moment.",
};

type HorizonErrorBody = {
  detail?: string;
  extras?: { result_codes?: { transaction?: string; operations?: string[] } };
};

export function getHorizonErrorMessage(err: unknown): string {
  const error = err as { message?: string; response?: { data?: HorizonErrorBody } };
  const data = error.response?.data;
  const codes = data?.extras?.result_codes;

  if (codes) {
    const opCode = codes.operations?.[0];
    if (opCode && OP_ERROR_MESSAGES[opCode]) return OP_ERROR_MESSAGES[opCode];
    const txCode = codes.transaction;
    if (txCode && TX_ERROR_MESSAGES[txCode]) return TX_ERROR_MESSAGES[txCode];
    const parts = [txCode, ...(codes.operations ?? [])].filter(Boolean);
    if (parts.length > 0) return `Transaction rejected: ${parts.join(" / ")}`;
  }

  if (data?.detail) return data.detail;
  if (error.message && !error.message.includes("status code 400")) return error.message;

  return "Transaction failed. Ensure Freighter is on Testnet, the recipient exists (or send ≥1 XLM to create it), and you have enough XLM.";
}

export const STELLAR_BASE_RESERVE_XLM = 1;
export const BASE_FEE_XLM = 0.00001;

export function normalizeXlmAmount(amount: string): string {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d{1,7})?$/.test(trimmed)) {
    throw new Error("Amount must be a positive number with at most 7 decimal places");
  }
  return trimmed;
}

export function validateSendAmount(amount: string, balance: string | null): void {
  const sendAmount = Number(amount);
  const available = Number(balance ?? 0);

  if (sendAmount + BASE_FEE_XLM > available) {
    throw new Error(`Insufficient balance. You need ${sendAmount} XLM plus the network fee (~${BASE_FEE_XLM} XLM).`);
  }

  const remaining = available - sendAmount - BASE_FEE_XLM;
  if (remaining < STELLAR_BASE_RESERVE_XLM) {
    const maxSendable = Math.max(0, available - STELLAR_BASE_RESERVE_XLM - BASE_FEE_XLM);
    throw new Error(
      `You must keep at least ${STELLAR_BASE_RESERVE_XLM} XLM in your account. Maximum sendable: ${maxSendable.toFixed(7)} XLM`
    );
  }
}
```

### `src/App.tsx` — Router & providers

```tsx
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
```

---

## Setup & Running Locally

**Prerequisites:** Node.js 18+, [pnpm](https://pnpm.io/), [Freighter extension](https://www.freighter.app/) set to **Testnet**

```bash
git clone https://github.com/rhapy01/Stellar-Payment-Dapp.git
cd Stellar-Payment-Dapp
pnpm install
pnpm --filter @workspace/stellar-dapp dev
# → http://localhost:3000
```

**Build & deploy:**

```bash
pnpm --filter @workspace/stellar-dapp build
npx vercel --prod --archive=tgz
```

---

## Tech Stack

- React 18 + TypeScript + Vite
- [`@stellar/freighter-api`](https://www.npmjs.com/package/@stellar/freighter-api) v6 — Freighter wallet integration
- [`@stellar/stellar-sdk`](https://www.npmjs.com/package/@stellar/stellar-sdk) v15 — Horizon API + transaction building
- Tailwind CSS + shadcn/ui

## License

MIT
