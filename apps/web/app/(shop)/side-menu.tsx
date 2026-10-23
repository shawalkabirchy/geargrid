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
// one name for the page tests.

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

export function SideMenu({
  shopName,
  appName,
  newSale,
  menuLabel,
  groups,
  footer,
}: {
  shopName: string;
  appName: string;
  newSale: string;
  menuLabel: string;
  groups: MenuGroup[];
  footer: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  const close = () => setOpen(false);

  return (
    <aside className="frame-scroll bg-frame text-frame-text print:hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:flex-none lg:flex-col lg:overflow-y-auto">
      <div className="flex items-center gap-3 px-4 py-3 lg:px-5 lg:pt-6 lg:pb-5">
        <Link href="/" onClick={close} className={`flex min-w-0 items-center gap-3 ${onFrame}`}>
          <Mark />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-xl leading-tight font-bold text-white">{shopName}</span>
            <span className="text-sm text-frame-muted">{appName}</span>
          </span>
        </Link>
        <Link
          href="/sales/new"
          onClick={close}
          className={`button-main ml-auto min-h-11 min-w-11 px-3 text-base whitespace-nowrap lg:hidden ${onFrame}`}
        >
          <Plus className="size-5" aria-hidden="true" />
          {/* only the plus on a narrow phone; the name stays for screen readers */}
          <span className="sr-only min-[440px]:not-sr-only">{newSale}</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="side-menu"
          className={`inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/30 px-3 text-white lg:hidden ${onFrame}`}
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
                    className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-[17px] ${onFrame} ${
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
  );
}
