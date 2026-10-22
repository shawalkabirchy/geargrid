"use client";

import { useActionState } from "react";
import { settingsAction, type FormState } from "../../actions";

interface Initial {
  shopName: string;
  marketArea: string;
  phone: string;
  address: string;
  language: string;
  banglaDigits: boolean;
  roundOffRule: number;
}

const FIELD_LABELS: Record<string, string> = {
  shopName: "shop_name",
  marketArea: "market_area",
  phone: "phone",
  address: "address",
  roundOffRule: "round_off",
};

export function SettingsForm({ labels, initial }: { labels: Record<string, string>; initial: Initial }) {
  const [state, action, pending] = useActionState<FormState, FormData>(settingsAction, { status: "idle" });
  const fields = (state.fields ?? []).map((field) => labels[FIELD_LABELS[field] ?? ""] ?? field).join(", ");
  return (
    <form action={action} className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{labels.title}</h1>
      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">{labels.shop}</h2>
        <label className="block">
          <span>{labels.shop_name}</span>
          <input name="shopName" defaultValue={initial.shopName} required maxLength={100} className="field" />
        </label>
        <label className="block">
          <span>{labels.market_area}</span>
          <input name="marketArea" defaultValue={initial.marketArea} maxLength={100} className="field" />
        </label>
        <label className="block">
          <span>{labels.phone}</span>
          <input name="phone" defaultValue={initial.phone} maxLength={30} inputMode="tel" className="field" />
        </label>
        <label className="block">
          <span>{labels.address}</span>
          <input name="address" defaultValue={initial.address} maxLength={200} className="field" />
        </label>
      </section>
      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">{labels.display}</h2>
        <label className="block">
          <span>{labels.language}</span>
          <select name="language" defaultValue={initial.language} className="field">
            <option value="bn">{labels.language_bn}</option>
            <option value="en">{labels.language_en}</option>
          </select>
        </label>
        <label className="flex min-h-12 items-center gap-3">
          <input
            name="banglaDigits"
            type="checkbox"
            defaultChecked={initial.banglaDigits}
            className="size-5 accent-brand"
          />
          <span>{labels.bangla_digits}</span>
        </label>
        <label className="block">
          <span>{labels.round_off}</span>
          <select name="roundOffRule" defaultValue={String(initial.roundOffRule)} className="field">
            <option value="1">{labels.round_off_1}</option>
            <option value="5">{labels.round_off_5}</option>
            <option value="10">{labels.round_off_10}</option>
          </select>
        </label>
      </section>
      <div className="flex items-center gap-4">
        <button type="submit" disabled={pending} className="button-primary">
          {pending ? labels.saving : labels.save}
        </button>
        {state.status === "ok" && (
          <p role="status" className="text-brand-ink">
            {labels.saved}
          </p>
        )}
        {state.status === "error" && (
          <p role="alert" className="text-red-700">
            {(labels.invalid ?? "").replace("{{fields}}", fields)}
          </p>
        )}
      </div>
    </form>
  );
}
