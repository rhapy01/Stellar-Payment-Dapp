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

// The form schema
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

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      recipient: "",
      amount: "",
    },
  });

  const checkConnection = async () => {
    try {
      const { isConnected: hasFreighter } = await freighter.isConnected();
      if (!hasFreighter) {
        setInstallPrompt(true);
        return;
      }
      setInstallPrompt(false);

      const { isAllowed } = await freighter.isAllowed();
      if (!isAllowed) return;

      const result = await freighter.getAddress();
      if (result.error) return;
      if (result.address) {
        setIsConnected(true);
        setPublicKey(result.address);
        fetchBalance(result.address);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    checkConnection();
  }, []);

  const connectWallet = async () => {
    const { isConnected: hasFreighter } = await freighter.isConnected();
    if (!hasFreighter) {
      setInstallPrompt(true);
      return;
    }
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
  };

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

  const onSubmit = async (values: PaymentFormValues) => {
    if (!publicKey) return;
    
    setTxPending(true);
    setTxSuccess(null);
    setTxError(null);
    
    try {
      if (balance && Number(values.amount) > Number(balance)) {
        throw new Error("Amount exceeds available XLM balance");
      }

      const server = new Horizon.Server("https://horizon-testnet.stellar.org");
      const sourceAccount = await server.loadAccount(publicKey);
      
      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.payment({
            destination: values.recipient,
            asset: Asset.native(),
            amount: values.amount,
          })
        )
        .setTimeout(30)
        .build();

      const signResult = await freighter.signTransaction(transaction.toXDR(), {
        networkPassphrase: Networks.TESTNET,
      });
      if (signResult.error) {
        throw new Error(
          typeof signResult.error === "object" && "message" in signResult.error
            ? String(signResult.error.message)
            : "Transaction signing was denied"
        );
      }
      
      const signedTx = TransactionBuilder.fromXDR(signResult.signedTxXdr, Networks.TESTNET);
      const result = await server.submitTransaction(signedTx);
      
      setTxSuccess({ hash: result.hash });
      fetchBalance(publicKey);
      form.reset();
    } catch (err: any) {
      console.error("Transaction error", err);
      setTxError(err?.message || "Transaction failed");
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
        
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30">
              <Send className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Stellar Pay</h1>
          </div>
          <div className="flex items-center space-x-2 bg-secondary/50 px-3 py-1 rounded-full border border-border">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">TESTNET</span>
          </div>
        </header>

        {/* Install Prompt */}
        {installPrompt && (
          <Alert variant="destructive" className="border-destructive/50 bg-destructive/10">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Wallet not found</AlertTitle>
            <AlertDescription>
              Please install the <a href="https://www.freighter.app" target="_blank" rel="noreferrer" className="underline font-medium hover:text-primary transition-colors">Freighter extension</a> to use this dApp.
            </AlertDescription>
          </Alert>
        )}

        <Card className="border-border bg-card shadow-2xl shadow-black/50">
          <CardHeader className="space-y-4 pb-4 border-b border-border/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Wallet Connection</CardTitle>
              {isConnected ? (
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-2 px-3 py-1.5 bg-secondary/50 rounded-md border border-border">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                    <span className="font-mono text-sm text-foreground" data-testid="text-wallet-address">{truncateAddress(publicKey || "")}</span>
                  </div>
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
              <div className="pt-4 flex items-end justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Available Balance</p>
                  <div className="flex items-baseline space-x-2">
                    {balanceLoading ? (
                      <div className="h-10 w-32 bg-secondary animate-pulse rounded-md" />
                    ) : (
                      <>
                        <span className="text-4xl font-mono font-semibold text-foreground tracking-tight" data-testid="text-balance">{balance}</span>
                        <span className="text-xl font-mono text-muted-foreground">XLM</span>
                      </>
                    )}
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => publicKey && fetchBalance(publicKey)}
                  disabled={balanceLoading}
                  className="text-muted-foreground hover:text-foreground"
                  data-testid="button-refresh-balance"
                >
                  <RefreshCw className={`h-5 w-5 ${balanceLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            )}
          </CardHeader>

          <CardContent className="pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="recipient"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground">Recipient Address</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="G..." 
                          className="font-mono bg-secondary/30 border-border focus:border-primary focus:ring-primary/20 h-12"
                          disabled={!isConnected || txPending}
                          data-testid="input-recipient"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage className="text-destructive font-medium" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs uppercase tracking-wider text-muted-foreground">Amount (XLM)</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input 
                            type="text"
                            placeholder="0.00" 
                            className="font-mono bg-secondary/30 border-border focus:border-primary focus:ring-primary/20 h-12 pr-16"
                            disabled={!isConnected || txPending}
                            data-testid="input-amount"
                            {...field} 
                          />
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                            <span className="font-mono text-muted-foreground">XLM</span>
                          </div>
                        </div>
                      </FormControl>
                      <FormMessage className="text-destructive font-medium" />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full h-12 text-base font-medium shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all hover:-translate-y-0.5 active:translate-y-0"
                  disabled={!isConnected || txPending}
                  data-testid="button-submit-tx"
                >
                  {txPending ? (
                    <>
                      <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
                      Processing Transaction...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-5 w-5" />
                      Send Payment
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>

          {/* Feedback Area */}
          {(txSuccess || txError) && (
            <CardFooter className="pb-6 pt-0 border-t border-border/50 mt-2">
              <div className="w-full mt-6">
                {txSuccess && (
                  <Alert className="bg-green-500/10 border-green-500/20 text-green-500">
                    <CheckCircle2 className="h-4 w-4 !text-green-500" />
                    <AlertTitle className="font-medium">Transaction Successful</AlertTitle>
                    <AlertDescription className="mt-2">
                      <a 
                        href={`https://stellar.expert/explorer/testnet/tx/${txSuccess.hash}`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-flex items-center space-x-1 text-sm hover:underline font-mono bg-green-500/10 px-2 py-1 rounded"
                        data-testid="link-tx-success"
                      >
                        <span>{txSuccess.hash.slice(0, 16)}...{txSuccess.hash.slice(-16)}</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </AlertDescription>
                  </Alert>
                )}

                {txError && (
                  <Alert variant="destructive" className="bg-destructive/10 border-destructive/20">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Transaction Failed</AlertTitle>
                    <AlertDescription className="mt-1 font-mono text-sm" data-testid="text-tx-error">
                      {txError}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}