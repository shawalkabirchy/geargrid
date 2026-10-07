import { AppError } from "@geargrid/core";
import bn from "./messages/bn.json";
import en from "./messages/en.json";

// The error and warning codes of spec 6.4, each with its HTTP status and its text in both languages. Answers use the
// nested shape { error: { code, message_en, message_bn, message_bn_key, details } } (spec 6.3).

export const ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN_SCOPE: 403,
  CUSTOM_PRICE_FORBIDDEN: 403,
  NOT_FOUND: 404,
  SALE_ALREADY_VOID: 409,
  SALE_HAS_RETURNS: 409,
  SALE_IS_VOID: 409,
  PAYMENT_ALREADY_REVERSED: 409,
  PURCHASE_ALREADY_REVERSED: 409,
  FITMENT_EXISTS: 409,
  IDEMPOTENCY_KEY_REUSED: 422,
  ACCOUNT_REQUIRED: 422,
  ACCOUNT_INVALID: 422,
  CHEQUE_DETAILS_REQUIRED: 422,
  PAYMENTS_EXCEED_TOTAL: 422,
  WALK_IN_CANNOT_HAVE_DUE: 422,
  PAYMENT_EXCEEDS_DUE: 422,
  DISCOUNT_TOO_HIGH: 422,
  PART_NOT_AVAILABLE: 422,
  RETURN_QTY_TOO_HIGH: 422,
  RETURN_REFUND_REQUIRED: 422,
  RETURN_REFUND_MISMATCH: 422,
  REFUND_DUE_EXCEEDS_BALANCE: 422,
  VOID_EXCEEDS_DUE: 422,
  REVERSAL_EXCEEDS_PAYABLE: 422,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export const WARNING_CODES = [
  "LOW_STOCK",
  "OVER_CREDIT_LIMIT",
  "INACTIVE_PART",
  "TRX_ID_MISSING",
  "AVG_COST_KEPT",
] as const;
export type WarningCode = (typeof WARNING_CODES)[number];

export interface Warning {
  code: WarningCode;
  message_en: string;
  message_bn: string;
  details: Record<string, unknown>;
}

/** A refusal with one of the codes of spec 6.4. */
export function apiError(code: ErrorCode, details?: Record<string, unknown>): AppError {
  return new AppError(code, ERROR_STATUS[code], `errors.${code}`, details);
}

export function warning(code: WarningCode, details: Record<string, unknown> = {}): Warning {
  return { code, message_en: en.warnings[code], message_bn: bn.warnings[code], details };
}

/** The error answer; anything that is not an AppError is INTERNAL and logged with the request ID. */
export function errorResponse(error: unknown, requestId: string): Response {
  const known = error instanceof AppError && error.code in ERROR_STATUS ? error : null;
  if (!known)
    console.error(
      JSON.stringify({ request_id: requestId, error: String(error), stack: (error as Error)?.stack }),
    );
  const code = (known?.code ?? "INTERNAL") as ErrorCode;
  return Response.json(
    {
      error: {
        code,
        message_en: en.errors[code],
        message_bn: bn.errors[code],
        message_bn_key: `errors.${code}`,
        details: known ? (known.details ?? {}) : { request_id: requestId },
      },
    },
    { status: ERROR_STATUS[code], headers: { "X-Request-Id": requestId } },
  );
}
