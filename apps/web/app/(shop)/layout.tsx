import { Languages, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { requireUser } from "../../src/web/auth";
import { pageContext } from "../../src/web/page-context";
import { languageAction, logoutAction } from "../actions";
import { SideMenu, type MenuGroup } from "./side-menu";

// The page frame of every logged-in page (DokaanBondhu spec D207): the menu in four groups under Home and New sale
// (the daily work, money, stock and catalog, the shop), the signed-in user, the language switch and logout.

const GROUPS = [
  { title: null, keys: ["home"] },
  { title: "nav.group_daily", keys: ["sales", "purchases", "customers", "suppliers"] },
  { title: "nav.group_money", keys: ["money", "expenses", "cheques"] },
  { title: "nav.group_catalog", keys: ["parts", "stock", "vehicles", "aliases"] },
  { title: "nav.group_shop", keys: ["reports", "review", "import", "audit", "settings"] },
] as const;

// The phone's bottom bar (D243, the owner's pick A): the daily work within thumb reach; every page stays in the menu.
const BAR = [
  { key: "home", href: "/" },
  { key: "sales", href: "/sales" },
  { key: "new_sale", href: "/sales/new" },
  { key: "parts", href: "/parts" },
  { key: "customers", href: "/customers" },
] as const;

const frameButton =
  "inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-[15px] text-white focus-visible:outline-marigold";

export default async function ShopLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const { t, settings, language } = await pageContext();
  const groups: MenuGroup[] = GROUPS.map((group) => ({
    ...(group.title ? { title: t(group.title) } : {}),
    items: group.keys.map((key) => ({
      key,
      href: key === "home" ? "/" : `/${key}`,
      label: t(`nav.${key}`),
    })),
  }));
  return (
    <div lang={language} className="min-h-screen lg:flex">
      <SideMenu
        shopName={settings.shopName}
        appName={t("app.name")}
        newSale={t("nav.new_sale")}
        menuLabel={t("nav.menu")}
        barLabel={t("nav.bar")}
        bar={BAR.map(({ key, href }) => ({ key, href, label: t(`nav.${key}`) }))}
        groups={groups}
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <span className="basis-full truncate text-[15px] text-frame-muted">{user.name}</span>
            <form action={languageAction}>
              <input type="hidden" name="language" value={language === "bn" ? "en" : "bn"} />
              <button type="submit" className={`${frameButton} border border-white/30 hover:bg-white/10`}>
                <Languages className="size-4" aria-hidden="true" />
                {t("nav.language")}
              </button>
            </form>
            <form action={logoutAction}>
              <button type="submit" className={`${frameButton} bg-white/10 hover:bg-white/20`}>
                <LogOut className="size-4" aria-hidden="true" />
                {t("nav.logout")}
              </button>
            </form>
          </div>
        }
      />
      {/* On a phone the page ends above the bottom bar (D243); from 1024 px it is as before. */}
      <main className="min-w-0 flex-1 px-4 pt-6 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 lg:py-8 print:p-0">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
