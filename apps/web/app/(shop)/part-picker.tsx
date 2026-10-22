"use client";

import { useEffect, useState, useTransition } from "react";
import { digitsText, type Labels } from "./client-format";
import { findPartsAction, type PartChoice } from "./trade-actions";

// The part search inside the sale and purchase forms: type two letters or more, pick a part from the list.

export function PartPicker({
  labels,
  banglaDigits,
  onPick,
}: {
  labels: Labels;
  banglaDigits: boolean;
  onPick: (part: PartChoice) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PartChoice[]>([]);
  const [searched, setSearched] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const text = query.trim();
    const timer = setTimeout(() => {
      if (text.length < 2) {
        setHits([]);
        setSearched(false);
        return;
      }
      startTransition(async () => {
        setHits(await findPartsAction(text));
        setSearched(true);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="relative">
      <label className="block">
        <span className="text-stone-700">{labels.find_part}</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="field"
          aria-label={labels.find_part}
          autoComplete="off"
        />
      </label>
      {(hits.length > 0 || searched) && (
        <ul className="absolute z-10 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-lg">
          {hits.length === 0 && <li className="px-3 py-2 text-stone-500">{labels.no_hits}</li>}
          {hits.map((part) => (
            <li key={part.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left hover:bg-brand-soft"
                onClick={() => {
                  onPick(part);
                  setQuery("");
                  setHits([]);
                  setSearched(false);
                }}
              >
                <span className="font-medium">{part.name}</span>
                <span className="ml-2 text-sm text-stone-500">
                  {part.number} · {digitsText(Number(part.stock), banglaDigits)}
                  {part.rack ? ` · ${part.rack}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
