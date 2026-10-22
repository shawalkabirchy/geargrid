import { pageContext } from "../../../src/web/page-context";
import { SettingsForm } from "./settings-form";

const LABELS = [
  "title",
  "shop",
  "shop_name",
  "market_area",
  "phone",
  "address",
  "display",
  "language",
  "language_bn",
  "language_en",
  "bangla_digits",
  "round_off",
  "round_off_1",
  "round_off_5",
  "round_off_10",
  "saved",
  "invalid",
] as const;

export default async function SettingsPage() {
  const { t, settings } = await pageContext();
  const labels: Record<string, string> = Object.fromEntries(
    LABELS.map((key) => [key, t(`settings.${key}`, { fields: "{{fields}}" })]),
  );
  return (
    <SettingsForm
      labels={{ ...labels, save: t("common.save"), saving: t("common.saving") }}
      initial={{
        shopName: settings.shopName,
        marketArea: settings.marketArea ?? "",
        phone: settings.phone ?? "",
        address: settings.address ?? "",
        language: settings.language,
        banglaDigits: settings.banglaDigits,
        roundOffRule: settings.roundOffRule,
      }}
    />
  );
}
