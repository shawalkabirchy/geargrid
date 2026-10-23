"use client";

import { Search } from "lucide-react";
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
        <span className="font-medium text-stone-700">{labels.find_part}</span>
        <span className="relative mt-1 block">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-stone-500"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="field mt-0 pl-11"
            aria-label={labels.find_part}
            autoComplete="off"
          />
        </span>
      </label>
      {(hits.length > 0 || searched) && (
        <ul className="absolute z-10 mt-2 max-h-96 w-full overflow-y-auto rounded-xl border border-stone-200 bg-white p-1 shadow-xl shadow-stone-900/10">
          {hits.length === 0 && <li className="px-3 py-3 text-stone-600">{labels.no_hits}</li>}
          {hits.map((part) => (
            <li key={part.id}>
              <button
                type="button"
                className="flex w-full flex-col items-start rounded-lg px-3 py-2.5 text-left hover:bg-brand-soft focus-visible:bg-brand-soft"
                onClick={() => {
                  onPick(part);
                  setQuery("");
                  setHits([]);
                  setSearched(false);
                }}
              >
                <span className="font-semibold">{part.name}</span>
                <span className="flex flex-wrap gap-x-3 text-sm text-stone-600">
                  <span>{part.number}</span>
                  <span className="tabular-nums">
                    {labels.in_stock?.replace("{{qty}}", digitsText(Number(part.stock), banglaDigits)) ??
                      digitsText(Number(part.stock), banglaDigits)}
                  </span>
                  {part.rack && <span>{part.rack}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
