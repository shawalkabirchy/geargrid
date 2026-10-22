import { createInstance, type TFunction } from "i18next";
import bn from "./locales/bn.json" with { type: "json" };
import en from "./locales/en.json" with { type: "json" };

// The screens' labels in Bangla and English (GearGrid plan 8.4), shared by the web dashboard and, later, the phone.

export const LANGUAGES = ["bn", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

export const messages = { bn, en } as const;

/** A translate function for one language, made synchronously (the labels are bundled, nothing is fetched). */
export function translator(language: Language): TFunction {
  const instance = createInstance();
  void instance.init({
    lng: language,
    fallbackLng: "bn",
    resources: { bn: { translation: bn }, en: { translation: en } },
    initAsync: false,
    interpolation: { escapeValue: false }, // React escapes
    returnNull: false,
  });
  return instance.t;
}
