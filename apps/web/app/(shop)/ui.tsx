import { ChevronRight, Inbox } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

// Small shared pieces of the dashboard's pages (look: DokaanBondhu spec D207): a labelled field, a page heading with
// its buttons, a table, a badge and an empty list.

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
  className?: string;
}) {
  // The hint sits between the label and the box, so the boxes of a row line up at the bottom (D207).
  return (
    <label className={`block ${className}`}>
      <span className="font-medium text-stone-700">{label}</span>
      {hint && <span className="block text-sm text-stone-500">{hint}</span>}
      {children}
    </label>
  );
}

export function Check({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex min-h-12 items-center gap-3">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="size-5 accent-brand" />
      <span>{label}</span>
    </label>
  );
}

export function PageHead({
  title,
  sub,
  children,
}: {
  title: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-3xl leading-tight font-bold">{title}</h1>
        {sub && <p className="mt-1 text-stone-600">{sub}</p>}
      </div>
      {/* On a narrow phone two or more buttons share the full width (D243); one stays beside the title. */}
      <div className="ml-auto flex flex-wrap gap-2 print:hidden max-sm:has-[>:nth-child(2)]:ml-0 max-sm:has-[>:nth-child(2)]:w-full max-sm:has-[>:nth-child(2)]:*:flex-1">
        {children}
      </div>
    </div>
  );
}

const BUTTONS = { main: "button-main", primary: "button-primary", secondary: "button-secondary" } as const;

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof BUTTONS;
  className?: string;
}) {
  return (
    <Link href={href} className={`${BUTTONS[variant]} ${className}`}>
      {children}
    </Link>
  );
}

/**
 * A table; the columns named in `right` (money, counts) are right-aligned, their headings too. With `cards`, a phone
 * (below 768 px) shows those cards instead and the table stays from 768 px up (D243). The cards are a second copy for
 * the eye, never a form: a form's fields exist once. A table that holds a form's fields is `stacked` instead: below
 * 768 px its head hides and each row, given `stackRow`, becomes a card itself, its cells given `stackCell`.
 */
export function Table({
  head,
  right = [],
  cards,
  stacked = false,
  children,
}: {
  head: ReactNode[];
  right?: number[];
  cards?: ReactNode;
  stacked?: boolean;
  children: ReactNode;
}) {
  const table = (
    <div
      className={`overflow-x-auto ${cards ? "hidden md:block" : ""} ${stacked ? "max-md:overflow-visible" : ""}`}
    >
      {/* At least 36rem wide: on a phone the table scrolls inside its card instead of crushing its columns. */}
      <table
        className={`w-full min-w-[36rem] text-left [&_tbody_tr:hover]:bg-stone-50 ${stacked ? "max-md:block max-md:min-w-0" : ""}`}
      >
        <thead className={stacked ? "max-md:hidden" : undefined}>
          <tr className="border-b-[1.5px] border-stone-200 text-sm text-stone-600">
            {head.map((label, index) => (
              <th
                key={index}
                className={`px-3 py-2.5 font-medium whitespace-nowrap ${right.includes(index) ? "text-right" : ""}`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={stacked ? "max-md:flex max-md:flex-col max-md:gap-3" : undefined}>{children}</tbody>
      </table>
    </div>
  );
  if (!cards) return table;
  return (
    <>
      {table}
      <ul className="flex flex-col gap-2 md:hidden">{cards}</ul>
    </>
  );
}

/**
 * One row of a list as a card on a phone (D243): the name and the amount on the first line, a second line and a
 * badge or figure on its right below; the whole card is the link when there is one.
 */
export function RowCard({
  href,
  title,
  amount,
  sub,
  side,
  extra,
}: {
  href?: string | undefined;
  title: ReactNode;
  amount?: ReactNode;
  sub?: ReactNode;
  side?: ReactNode;
  extra?: ReactNode;
}) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{title}</span>
          {amount !== undefined && <span className="font-bold whitespace-nowrap tabular-nums">{amount}</span>}
        </div>
        {(sub !== undefined || side !== undefined) && (
          <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[15px] text-stone-600">
            <span className="min-w-0">{sub}</span>
            {side}
          </div>
        )}
        {extra}
      </div>
      {href && <ChevronRight className="size-[18px] shrink-0 text-stone-400" aria-hidden="true" />}
    </>
  );
  const box =
    "flex min-h-16 items-center gap-2.5 rounded-2xl border border-stone-200 bg-white py-2.5 pr-3 pl-3.5";
  return (
    <li>
      {href ? (
        <Link href={href} className={`${box} text-stone-900 hover:bg-stone-50`}>
          {body}
        </Link>
      ) : (
        <div className={box}>{body}</div>
      )}
    </li>
  );
}

/**
 * A phone's bar just above the bottom bar with a form's total and its Save button (D243), and room kept for it below
 * the form. It is hidden from 1024 px, where the form's own Save button shows; that one is hidden below 1024 px, so
 * Save is on screen once.
 */
export function PhoneSaveBar({
  label,
  total,
  detail,
  save,
  onSave,
  disabled,
}: {
  label: string | undefined;
  total: ReactNode;
  detail?: ReactNode;
  save: string | undefined;
  onSave: () => void;
  disabled: boolean;
}) {
  return (
    <>
      <div aria-hidden="true" className="h-20 lg:hidden" />
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 border-t border-stone-200 bg-white px-4 py-2.5 shadow-[0_-8px_20px_-14px_rgb(30_37_86/0.45)] lg:hidden print:hidden">
        <div className="min-w-0 flex-1 leading-tight">
          <span className="block text-sm text-stone-600">{label}</span>
          <strong className="figure block text-[22px] font-bold">{total}</strong>
          {detail && <span className="block text-sm">{detail}</span>}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onSave}
          className="button-main min-h-13 shrink-0 px-5 text-lg"
        >
          {save}
        </button>
      </div>
    </>
  );
}

/** A small heading between groups of cards on a phone: a day of sales. */
export function CardGroup({ title, side }: { title: ReactNode; side?: ReactNode }) {
  return (
    <li className="mt-2 flex items-baseline justify-between gap-3 text-[15px] font-semibold text-stone-700 first:mt-0">
      <span>{title}</span>
      {side && <span className="font-normal text-stone-500">{side}</span>}
    </li>
  );
}

const TONES = {
  neutral: "bg-stone-100 text-stone-700",
  brand: "bg-brand-soft text-brand-ink",
  owed: "bg-red-50 text-red-700",
  paid: "bg-paid-soft text-paid",
  warn: "bg-amber-50 text-amber-800",
} as const;

/** A short state beside a name: out of stock, inactive, overdue, genuine. */
export function Badge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 text-sm font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  );
}

/** An empty list: what it means, and what to do next. */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border-[1.5px] border-dashed border-stone-300 px-5 py-6 text-stone-600">
      <Inbox className="size-6 text-stone-400" aria-hidden="true" />
      <p>{children}</p>
      {action}
    </div>
  );
}

/** A small link next to a page's title: a record's history, its statement. */
export function SmallLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="button-secondary print:hidden">
      {children}
    </Link>
  );
}

export const cell = "border-t border-stone-200 px-3 py-3";
/** A row of a `stacked` table on a phone: a card of two columns (D243). */
export const stackRow =
  "max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:gap-x-3 max-md:gap-y-1 max-md:rounded-2xl max-md:border max-md:border-stone-200 max-md:bg-white max-md:p-3.5";
/** A cell of a `stacked` table on a phone: no border or padding of its own. */
export const stackCell = "max-md:border-0 max-md:p-0";
export const money = `${cell} text-right tabular-nums whitespace-nowrap`;
const smallBase =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-stone-300 bg-white px-3 text-base font-semibold hover:bg-stone-100 max-lg:min-h-11";
export const small = `${smallBase} text-brand-ink`;
/** A small button that undoes or refuses something: a bounced cheque. */
export const smallDanger = `${smallBase} text-red-700`;
