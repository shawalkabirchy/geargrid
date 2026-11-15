"use client";

import {
  Banknote,
  Boxes,
  Car,
  ChartColumn,
  CircleMinus,
  Cog,
  Eye,
  Factory,
  FileUp,
  History,
  House,
  Menu,
  Plus,
  ReceiptText,
  SlidersHorizontal,
  Tags,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Mark } from "../mark";

// The menu of every logged-in page (DokaanBondhu spec D207): from 1024 px a sidebar in the indigo frame, sticky with
// its own scroll; on a phone a top bar whose menu button opens the same links. The links exist once, so each keeps
// one name for the page tests. Below 1024 px a bar of five buttons stays at the bottom (D243): Home, Sales, New sale
// in marigold in the middle, Parts and Customers; it is hidden on a computer, so the page tests there never see it.

export interface MenuItem {
  key: string;
  href: string;
  label: string;
}

export interface MenuGroup {
  title?: string;
  items: MenuItem[];
}

const ICONS: Record<string, LucideIcon> = {
  home: House,
  sales: ReceiptText,
  purchases: Truck,
  customers: Users,
  suppliers: Factory,
  money: Wallet,
  expenses: CircleMinus,
  cheques: Banknote,
  parts: Cog,
  stock: Boxes,
  vehicles: Car,
  aliases: Tags,
  reports: ChartColumn,
  review: Eye,
  import: FileUp,
  audit: History,
  settings: SlidersHorizontal,
};

const onFrame = "focus-visible:outline-marigold";

const BAR_ICONS: Record<string, LucideIcon> = {
  home: House,
  sales: ReceiptText,
  parts: Cog,
  customers: Users,
};

export function SideMenu({
  shopName,
  appName,
  newSale,
  menuLabel,
  barLabel,
  bar,
  groups,
  footer,
}: {
  shopName: string;
  appName: string;
  newSale: string;
  menuLabel: string;
  barLabel: string;
  /** The bottom bar's buttons, in order; the one keyed `new_sale` is the marigold one in the middle. */
  bar: MenuItem[];
  groups: MenuGroup[];
  footer: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  const close = () => setOpen(false);
  // On the bar, New sale is its own button, so Sales is not marked while a sale is being made.
  const onBar = (item: MenuItem) =>
    item.key === "sales" ? isActive(item.href) && !pathname.startsWith("/sales/new") : isActive(item.href);

  return (
    <>
      <nav
        aria-label={barLabel}
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_20px_-14px_rgb(30_37_86/0.45)] lg:hidden print:hidden"
      >
        {bar.map((item) => {
          const active = onBar(item);
          if (item.key === "new_sale") {
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={close}
                aria-current={active ? "page" : undefined}
                className="relative flex min-h-16 flex-col items-center justify-end pb-2 text-[13px] leading-tight font-bold text-marigold-ink"
              >
                <span
                  aria-hidden="true"
                  className={`absolute -top-5 inline-flex size-14 items-center justify-center rounded-full border-4 bg-marigold shadow-[0_6px_14px_-6px_rgb(42_30_0/0.55)] ${
                    active ? "border-brand-ink" : "border-white"
                  }`}
                >
                  <Plus className="size-7" strokeWidth={2.6} />
                </span>
                <span className="text-center">{item.label}</span>
              </Link>
            );
          }
          const Icon = BAR_ICONS[item.key] ?? House;
          return (
            <Link
              key={item.key}
              href={item.href}
              onClick={close}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-[13px] leading-tight ${
                active ? "font-bold text-brand-ink" : "text-stone-600"
              }`}
            >
              <span
                aria-hidden="true"
                className={`inline-flex h-8 w-13 items-center justify-center rounded-full ${active ? "bg-brand-soft" : ""}`}
              >
                <Icon className="size-[22px]" strokeWidth={active ? 2.2 : 1.9} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <aside className="frame-scroll bg-frame text-frame-text print:hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:flex-none lg:flex-col lg:overflow-y-auto">
        {/* On a phone the bar keeps room for a notch when installed full screen (D243); env() is 0 elsewhere. */}
        <div className="flex items-center gap-3 px-4 py-3 max-lg:pt-[calc(0.75rem+env(safe-area-inset-top))] lg:px-5 lg:pt-6 lg:pb-5">
          <Link href="/" onClick={close} className={`flex min-w-0 items-center gap-3 ${onFrame}`}>
            <Mark />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-xl leading-tight font-bold text-white">{shopName}</span>
              <span className="text-sm text-frame-muted">{appName}</span>
            </span>
          </Link>
          {/* New sale is on the bottom bar on a phone (D243), so the top bar keeps only the menu button. */}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls="side-menu"
            className={`ml-auto inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/30 px-3 text-white lg:hidden ${onFrame}`}
          >
            <Menu className="size-5" aria-hidden="true" />
            {menuLabel}
          </button>
        </div>

        <div
          id="side-menu"
          className={`${open ? "flex" : "hidden"} flex-col gap-5 px-3 pb-5 lg:flex lg:flex-1`}
        >
          <Link
            href="/sales/new"
            aria-current={pathname === "/sales/new" ? "page" : undefined}
            className={`button-main hidden w-full lg:flex ${pathname === "/sales/new" ? "ring-2 ring-white" : ""} ${onFrame}`}
          >
            <Plus className="size-5" aria-hidden="true" />
            {newSale}
          </Link>
          <nav aria-label={menuLabel} className="flex flex-col gap-4">
            {groups.map((group, index) => (
              <div key={group.title ?? index} className="flex flex-col gap-0.5">
                {group.title && <p className="px-3 pb-1 text-sm text-frame-muted">{group.title}</p>}
                {group.items.map((item) => {
                  const Icon = ICONS[item.key] ?? House;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      onClick={close}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-[17px] max-lg:min-h-11 ${onFrame} ${
                        active
                          ? "bg-white/12 font-semibold text-white"
                          : "text-frame-text hover:bg-white/7 hover:text-white"
                      }`}
                    >
                      <Icon
                        className={`size-5 flex-none ${active ? "text-marigold" : ""}`}
                        strokeWidth={1.8}
                        aria-hidden="true"
                      />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="mt-auto border-t border-white/15 px-2 pt-4">{footer}</div>
        </div>
      </aside>
    </>
  );
}
