"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { WebState } from "../../src/web/forms";

// A form for one server action: it is disabled while saving, shows the answer (saved, or what is wrong), and clears
// itself after a success when `reset` is set (an "add" form).

export function ActionForm({
  action,
  children,
  className,
  reset = false,
}: {
  action: (state: WebState, form: FormData) => Promise<WebState>;
  children: ReactNode;
  className?: string;
  reset?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (reset && state.status === "ok") form.current?.reset();
  }, [reset, state.done, state.status]);
  return (
    <form ref={form} action={formAction} className={className}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {state.message && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={state.status === "error" ? "mt-2 text-red-700" : "mt-2 text-brand-ink"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
