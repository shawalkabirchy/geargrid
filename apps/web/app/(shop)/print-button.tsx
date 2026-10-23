"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="button-secondary">
      <Printer className="size-5" aria-hidden="true" />
      {label}
    </button>
  );
}
