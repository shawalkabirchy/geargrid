import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "../../src/web/auth";
import { pageContext } from "../../src/web/page-context";
import { languageAction, logoutAction } from "../actions";

// The page frame of every logged-in page: shop name, menu, language switch, logout.

export default async function ShopLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const { t, settings, language } = await pageContext();
  return (
    <div lang={language} className="min-h-screen">
      <header className="bg-brand text-white print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="text-xl font-bold">
            {settings.shopName}
          </Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-lg">
            <Link href="/" className="hover:underline">
              {t("nav.home")}
            </Link>
            <Link
              href="/sales/new"
              className="rounded-lg bg-white px-2 font-semibold text-brand-ink hover:bg-brand-soft"
            >
              {t("nav.new_sale")}
            </Link>
            <Link href="/sales" className="hover:underline">
              {t("nav.sales")}
            </Link>
            <Link href="/purchases" className="hover:underline">
              {t("nav.purchases")}
            </Link>
            <Link href="/parts" className="hover:underline">
              {t("nav.parts")}
            </Link>
            <Link href="/customers" className="hover:underline">
              {t("nav.customers")}
            </Link>
            <Link href="/suppliers" className="hover:underline">
              {t("nav.suppliers")}
            </Link>
            <Link href="/vehicles" className="hover:underline">
              {t("nav.vehicles")}
            </Link>
            <Link href="/aliases" className="hover:underline">
              {t("nav.aliases")}
            </Link>
            <Link href="/money" className="hover:underline">
              {t("nav.money")}
            </Link>
            <Link href="/expenses" className="hover:underline">
              {t("nav.expenses")}
            </Link>
            <Link href="/cheques" className="hover:underline">
              {t("nav.cheques")}
            </Link>
            <Link href="/stock" className="hover:underline">
              {t("nav.stock")}
            </Link>
            <Link href="/review" className="hover:underline">
              {t("nav.review")}
            </Link>
            <Link href="/settings" className="hover:underline">
              {t("nav.settings")}
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-brand-soft">{user.name}</span>
            <form action={languageAction}>
              <input type="hidden" name="language" value={language === "bn" ? "en" : "bn"} />
              <button
                type="submit"
                className="rounded-lg border border-white/60 px-3 py-1.5 hover:bg-brand-dark"
              >
                {t("nav.language")}
              </button>
            </form>
            <form action={logoutAction}>
              <button type="submit" className="rounded-lg bg-brand-dark px-3 py-1.5 hover:bg-brand-ink">
                {t("nav.logout")}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
