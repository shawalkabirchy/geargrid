import Link from "next/link";
import type { ReactNode } from "react";

// Small shared pieces of the dashboard's pages: a labelled field, a page heading with its buttons, a table.

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
  return (
    <label className={`block ${className}`}>
      <span className="text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-stone-500">{hint}</span>}
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

export function PageHead({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="ml-auto flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function ButtonLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="button-primary inline-flex items-center">
      {children}
    </Link>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-stone-200 text-sm text-stone-500">
            {head.map((cell, index) => (
              <th key={index} className="px-2 py-2 font-medium">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** A small link next to a page's title: a record's history, its statement. */
export function SmallLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-12 items-center rounded-lg border border-stone-300 px-3 hover:bg-stone-100 print:hidden"
    >
      {children}
    </Link>
  );
}

export const cell = "border-t border-stone-100 px-2 py-2";
export const money = `${cell} text-right tabular-nums`;
export const small = "rounded-lg border border-stone-300 px-3 py-1.5 text-base hover:bg-stone-100";
