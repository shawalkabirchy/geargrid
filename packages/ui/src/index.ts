import { createInstance, type TFunction } from "i18next";
import bn from "./locales/bn.json" with { type: "json" };
import en from "./locales/en.json" with { type: "json" };

// The screens' labels in Bangla and English (GearGrid plan 8.4), shared by the web dashboard and, later, the phone.
// A label writes a number the shop's way with the "digits" format: "{{count, digits}}টি বিল" is "৫৭টি বিল" when the
// shop uses Bangla digits.

export const LANGUAGES = ["bn", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

export const messages = { bn, en } as const;

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

/** 0-9 written as Bangla digits. */
export const banglaDigits = (text: string) => text.replace(/\d/g, (d) => BANGLA_DIGITS[Number(d)] ?? d);

/** A translate function for one language, made synchronously (the labels are bundled, nothing is fetched). */
export function translator(language: Language, options: { banglaDigits?: boolean } = {}): TFunction {
  const instance = createInstance();
  void instance.init({
    lng: language,
    fallbackLng: "bn",
    resources: { bn: { translation: bn }, en: { translation: en } },
    initAsync: false,
    interpolation: { escapeValue: false }, // React escapes
    returnNull: false,
  });
  instance.services.formatter?.add("digits", (value: unknown) =>
    options.banglaDigits ? banglaDigits(String(value)) : String(value),
  );
  return instance.t;
}
