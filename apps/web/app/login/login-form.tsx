"use client";

import { useActionState } from "react";
import { loginAction, type FormState } from "../actions";

export function LoginForm({
  labels,
}: {
  labels: Record<"title" | "email" | "password" | "submit" | "failed" | "too_many", string>;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, { status: "idle" });
  const message = state.message === "login.too_many" ? labels.too_many : state.message ? labels.failed : null;
  return (
    <form action={action} className="space-y-4 rounded-xl bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">{labels.title}</h2>
      <label className="block">
        <span className="text-stone-700">{labels.email}</span>
        <input name="email" type="email" required autoComplete="username" className="field" />
      </label>
      <label className="block">
        <span className="text-stone-700">{labels.password}</span>
        <input name="password" type="password" required autoComplete="current-password" className="field" />
      </label>
      {message && (
        <p role="alert" className="text-red-700">
          {message}
        </p>
      )}
      <button type="submit" disabled={pending} className="button-primary w-full">
        {labels.submit}
      </button>
    </form>
  );
}
