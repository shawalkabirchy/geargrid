import { formatDate, formatTaka } from "@geargrid/core";
import { translator, type Language } from "@geargrid/ui";
import { database } from "../server/db";
import { getSettings, type Settings } from "../server/services/settings";

// What every page needs: the shop's settings, its language's labels, and taka and dates written its way.

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

export interface PageContext {
  settings: Settings;
  language: Language;
  t: ReturnType<typeof translator>;
  /** "৪,৫০০ টাকা" or "4,500 taka". */
  taka: (amount: bigint) => string;
  /** dd/mm/yyyy, in Bangla digits when the shop uses them. */
  date: (value: string | Date) => string;
  /** A quantity without its trailing zeros ("3.000" as 3, "1.500" as 1.5), in the shop's digits. */
  qty: (value: string | number) => string;
  /** Plain digits written the shop's way (years, counts). */
  digits: (text: string | number) => string;
}

export async function pageContext(): Promise<PageContext> {
  const settings = await getSettings(database());
  const language: Language = settings.language === "en" ? "en" : "bn";
  const t = translator(language);
  const digits = (text: string) =>
    settings.banglaDigits ? text.replace(/\d/g, (d) => BANGLA_DIGITS[Number(d)] ?? d) : text;
  return {
    settings,
    language,
    t,
    taka: (amount) =>
      t("common.taka", { amount: formatTaka(amount, { banglaDigits: settings.banglaDigits }) }),
    date: (value) => digits(formatDate(value)),
    qty: (value) => digits(String(Number(value))),
    digits: (text) => digits(String(text)),
  };
}
