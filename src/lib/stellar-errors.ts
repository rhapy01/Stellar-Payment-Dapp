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
  extras?: {
    result_codes?: {
      transaction?: string;
      operations?: string[];
    };
  };
};

export function getHorizonErrorMessage(err: unknown): string {
  const error = err as {
    message?: string;
    response?: { data?: HorizonErrorBody };
  };

  const data = error.response?.data;
  const codes = data?.extras?.result_codes;

  if (codes) {
    const opCode = codes.operations?.[0];
    if (opCode && OP_ERROR_MESSAGES[opCode]) {
      return OP_ERROR_MESSAGES[opCode];
    }

    const txCode = codes.transaction;
    if (txCode && TX_ERROR_MESSAGES[txCode]) {
      return TX_ERROR_MESSAGES[txCode];
    }

    const parts = [txCode, ...(codes.operations ?? [])].filter(Boolean);
    if (parts.length > 0) {
      return `Transaction rejected: ${parts.join(" / ")}`;
    }
  }

  if (data?.detail) {
    return data.detail;
  }

  if (error.message && !error.message.includes("status code 400")) {
    return error.message;
  }

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
    throw new Error(
      `Insufficient balance. You need ${sendAmount} XLM plus the network fee (~${BASE_FEE_XLM} XLM).`
    );
  }

  const remaining = available - sendAmount - BASE_FEE_XLM;
  if (remaining < STELLAR_BASE_RESERVE_XLM) {
    const maxSendable = Math.max(0, available - STELLAR_BASE_RESERVE_XLM - BASE_FEE_XLM);
    throw new Error(
      `You must keep at least ${STELLAR_BASE_RESERVE_XLM} XLM in your account. Maximum sendable: ${maxSendable.toFixed(7)} XLM`
    );
  }
}
