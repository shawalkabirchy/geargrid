// The label keys the browser forms need (they get their text from the page, in the shop's language).

export const SALE_LABELS = [
  "customer",
  "walk_in",
  "find_part",
  "no_hits",
  "part",
  "qty",
  "price",
  "line_total",
  "list_price",
  "in_stock",
  "subtotal",
  "discount",
  "discount_amount",
  "discount_percent",
  "round_off",
  "total",
  "paid",
  "due",
  "payments",
  "add_payment",
  "method",
  "account",
  "amount",
  "trx_id",
  "cheque_bank",
  "cheque_no",
  "cheque_due",
  "empty_cart",
  "save",
  "warnings",
  "save_anyway",
  "customer_due_now",
  "note",
  "need_customer_for_due",
] as const;

export const METHOD_KEYS = ["cash", "bkash", "nagad", "rocket", "bank", "cheque"] as const;

export const RETURN_LABELS = [
  "qty",
  "can_return",
  "restock",
  "restock_yes",
  "restock_damaged",
  "calc",
  "total",
  "refund_due",
  "refund_cash",
  "reason",
  "save",
  "nothing",
  "split_hint",
  "customer_due",
] as const;

export const PURCHASE_LABELS = ["supplier", "pick_supplier", "bill_no", "unit_cost", "save"] as const;
