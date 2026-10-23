import { Inbox } from "lucide-react";
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
      <div className="ml-auto flex flex-wrap gap-2 print:hidden">{children}</div>
    </div>
  );
}

const BUTTONS = { main: "button-main", primary: "button-primary", secondary: "button-secondary" } as const;

export function ButtonLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof BUTTONS;
}) {
  return (
    <Link href={href} className={BUTTONS[variant]}>
      {children}
    </Link>
  );
}

/** A table; the columns named in `right` (money, counts) are right-aligned, their headings too. */
export function Table({
  head,
  right = [],
  children,
}: {
  head: ReactNode[];
  right?: number[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      {/* At least 36rem wide: on a phone the table scrolls inside its card instead of crushing its columns. */}
      <table className="w-full min-w-[36rem] text-left [&_tbody_tr:hover]:bg-stone-50">
        <thead>
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
        <tbody>{children}</tbody>
      </table>
    </div>
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
export const money = `${cell} text-right tabular-nums whitespace-nowrap`;
const smallBase =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-stone-300 bg-white px-3 text-base font-semibold hover:bg-stone-100";
export const small = `${smallBase} text-brand-ink`;
/** A small button that undoes or refuses something: a bounced cheque. */
export const smallDanger = `${smallBase} text-red-700`;
