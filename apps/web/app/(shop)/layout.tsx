import Link from "next/link";
import type { ReactNode } from "react";
import { requireUser } from "../../src/web/auth";
import { pageContext } from "../../src/web/page-context";
import { languageAction, logoutAction } from "../actions";

// The page frame of every logged-in page: shop name, the menu in two rows (the daily work, then the rest), the
// language switch and logout.

const MAIN = ["sales", "purchases", "parts", "customers", "suppliers", "money", "reports"] as const;
const MORE = [
  "stock",
  "expenses",
  "cheques",
  "review",
  "vehicles",
  "aliases",
  "import",
  "audit",
  "settings",
] as const;

export default async function ShopLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const { t, settings, language } = await pageContext();
  return (
    <div lang={language} className="min-h-screen">
      <header className="bg-brand text-white print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 pt-3">
          <Link href="/" className="text-xl font-bold">
            {settings.shopName}
          </Link>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-lg">
            <Link href="/" className="hover:underline">
              {t("nav.home")}
            </Link>
            <Link
              href="/sales/new"
              className="rounded-lg bg-white px-2 font-semibold text-brand-ink hover:bg-brand-soft"
            >
              {t("nav.new_sale")}
            </Link>
            {MAIN.map((key) => (
              <Link key={key} href={`/${key}`} className="hover:underline">
                {t(`nav.${key}`)}
              </Link>
            ))}
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
        <nav className="mx-auto flex max-w-6xl flex-wrap gap-x-4 gap-y-1 px-4 pt-1 pb-2 text-base text-brand-soft">
          {MORE.map((key) => (
            <Link key={key} href={`/${key}`} className="hover:text-white hover:underline">
              {t(`nav.${key}`)}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
