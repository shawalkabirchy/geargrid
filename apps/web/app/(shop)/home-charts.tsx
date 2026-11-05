import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

// Home's charts (DokaanBondhu spec D231), drawn on the server in plain HTML: no chart library and no script. The
// marks follow the house rules for charts: thin columns with 4px rounded tops on one baseline, a 2px gap between
// touching marks, solid hairline grids, text in the ink colours (never the mark's), a tooltip on hover that only
// repeats what the table view and the labels already show.

/** A round top for an axis, split into `steps` equal steps (1, 2, 2.5 or 5 times a power of ten). */
export function niceTop(max: number, steps = 4): number {
  if (max <= 0) return steps * 1000;
  const raw = max / steps;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? 10 * power;
  return step * steps;
}

/** A card's heading row: the title, an optional line under it, and a small link to the full page on the right. */
export function CardHead({
  title,
  sub,
  href,
  link,
}: {
  title: ReactNode;
  sub?: ReactNode;
  href?: string;
  link?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold">{title}</h2>
        {sub && <p className="text-stone-600">{sub}</p>}
      </div>
      {href && link && (
        <Link
          href={href}
          className="group -mr-2 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 font-semibold text-brand-ink hover:bg-brand-soft"
        >
          {link}
          <ChevronRight
            className="size-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      )}
    </div>
  );
}

export interface Column {
  key: string;
  /** The column's height, 0 to 100 percent of the plot. */
  height: number;
  /** A label under the column (a few of them only), and whether it is today's. */
  label?: string;
  strong?: boolean;
  /** The tooltip: the value first, then what it is. */
  value: string;
  lines: string[];
}

/** Columns on one baseline with a y axis of round steps; each column shows its tooltip on hover. */
export function ColumnChart({
  label,
  columns,
  ticks,
}: {
  label: string;
  columns: Column[];
  ticks: { pct: number; label: string }[];
}) {
  const edge = (index: number) =>
    index < 3 ? "left-0" : index >= columns.length - 3 ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <figure aria-label={label} className="mt-6">
      <div className="flex gap-3">
        <div aria-hidden="true" className="relative h-60 w-16 shrink-0">
          {ticks.map((tick) => (
            <span
              key={tick.pct}
              className="absolute right-0 translate-y-1/2 text-sm whitespace-nowrap text-stone-500 tabular-nums"
              style={{ bottom: `${tick.pct}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
        <div className="relative h-60 min-w-0 flex-1">
          {ticks.map((tick) => (
            <div
              key={tick.pct}
              aria-hidden="true"
              className={`absolute inset-x-0 h-px ${tick.pct === 0 ? "bg-stone-300" : "bg-stone-200"}`}
              style={{ bottom: `${tick.pct}%` }}
            />
          ))}
          <ol className="absolute inset-0 flex items-end gap-[2px]">
            {columns.map((column, index) => (
              <li key={column.key} className="group relative flex h-full flex-1 items-end justify-center">
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 bottom-0 rounded-md transition-colors group-hover:bg-brand-soft/80"
                />
                <span
                  aria-hidden="true"
                  className={`relative w-full max-w-6 rounded-t-[4px] transition-colors ${
                    column.height > 0
                      ? column.strong
                        ? "bg-brand-ink group-hover:bg-frame"
                        : "bg-brand group-hover:bg-brand-dark"
                      : "bg-stone-300"
                  }`}
                  style={{ height: column.height > 0 ? `max(${column.height}%, 3px)` : "2px" }}
                />
                <span
                  role="tooltip"
                  className={`pointer-events-none absolute z-10 hidden w-max min-w-40 rounded-xl bg-stone-900 px-3.5 py-2.5 text-sm text-stone-300 shadow-xl group-hover:block ${edge(index)}`}
                  style={{ bottom: `calc(${column.height}% + 12px)` }}
                >
                  <strong className="block text-base font-semibold text-white">{column.value}</strong>
                  {column.lines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div aria-hidden="true" className="flex gap-3">
        <div className="w-16 shrink-0" />
        <ol className="flex min-w-0 flex-1 gap-[2px]">
          {columns.map((column, index) => (
            <li key={column.key} className="relative h-8 flex-1">
              {column.label && (
                <span
                  className={`absolute top-2 text-sm whitespace-nowrap ${
                    index === columns.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2"
                  } ${column.strong ? "font-semibold text-stone-900" : "text-stone-500"}`}
                >
                  {column.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </figure>
  );
}

/** Small columns for the indigo band: the last days in a faint white, today in marigold. */
export function MiniColumns({ heights }: { heights: number[] }) {
  return (
    <div aria-hidden="true" className="flex h-14 items-end gap-1">
      {heights.map((height, index) => (
        <span
          key={index}
          className={`flex-1 rounded-t-[3px] ${index === heights.length - 1 ? "bg-marigold" : "bg-white/25"}`}
          style={{ height: height > 0 ? `max(${height}%, 3px)` : "2px" }}
        />
      ))}
    </div>
  );
}

/** A thin bar in a track: a share of a whole or of the largest row. */
export function Meter({ pct, tone = "brand" }: { pct: number; tone?: "brand" | "owed" }) {
  return (
    <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-stone-100">
      <span
        className={`block h-full rounded-full ${tone === "owed" ? "bg-red-700" : "bg-brand"}`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </span>
  );
}

/** The dues by age, light to dark red: up to 30 days, 31-60, 61-90, older (checked: one hue, steps apart). */
export const AGE_COLOURS = ["#e88a80", "#d9534a", "#b42318", "#7a1a14"] as const;
const AGE_INK = ["#191c2b", "#191c2b", "#ffffff", "#ffffff"] as const;

/** One whole split into its parts, each block's share printed inside when it fits. */
export function SegmentedBar({
  label,
  parts,
}: {
  label: string;
  parts: { key: string; pct: number; share: string; title: string }[];
}) {
  return (
    <div role="img" aria-label={label} className="flex h-7 gap-[2px]">
      {parts.map((part, index) =>
        part.pct > 0 ? (
          <span
            key={part.key}
            title={part.title}
            className="flex min-w-1 items-center rounded-[4px] px-2 text-sm font-semibold"
            style={{ flex: `${part.pct} 1 0%`, background: AGE_COLOURS[index], color: AGE_INK[index] }}
          >
            {part.pct >= 12 ? part.share : ""}
          </span>
        ) : null,
      )}
    </div>
  );
}
