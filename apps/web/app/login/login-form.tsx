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
    <form action={action} className="space-y-5">
      <h2 className="text-3xl font-bold">{labels.title}</h2>
      <label className="block">
        <span className="font-medium text-stone-700">{labels.email}</span>
        <input name="email" type="email" required autoComplete="username" className="field" />
      </label>
      <label className="block">
        <span className="font-medium text-stone-700">{labels.password}</span>
        <input name="password" type="password" required autoComplete="current-password" className="field" />
      </label>
      {message && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-red-700">
          {message}
        </p>
      )}
      <button type="submit" disabled={pending} className="button-primary w-full">
        {labels.submit}
      </button>
    </form>
  );
}
