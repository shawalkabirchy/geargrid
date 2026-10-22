import type { Db } from "@geargrid/db";
import { settings } from "@geargrid/db";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "../db";
import { audit, type AuditActor } from "../posting";

// The shop's settings (GearGrid plan 2.12): profile, language, Bangla digits and the round-off rule. One row, id 1.
// Settings have no UUID, so they write no change-log row; the phone reads them whole when it syncs (slice C round 2).

type Reader = Db | Tx;
export type Settings = typeof settings.$inferSelect;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value));

export const settingsInput = z.object({
  shopName: z.string().trim().min(1).max(100),
  marketArea: optionalText(100),
  phone: optionalText(30),
  address: optionalText(200),
  language: z.enum(["bn", "en"]),
  banglaDigits: z.boolean(),
  roundOffRule: z.union([z.literal(1), z.literal(5), z.literal(10)]),
});
export type SettingsInput = z.infer<typeof settingsInput>;

export async function getSettings(db: Reader): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (!row) throw new Error("the settings row is missing");
  return row;
}

function profile(row: Settings) {
  return {
    shop_name: row.shopName,
    market_area: row.marketArea,
    phone: row.phone,
    address: row.address,
    language: row.language,
    bangla_digits: row.banglaDigits,
    round_off_rule: row.roundOffRule,
  };
}

/** Saves every field at once, with an audit row holding the old and new values. */
export async function updateSettings(tx: Tx, actor: AuditActor, input: SettingsInput): Promise<Settings> {
  const [before] = await tx.select().from(settings).where(eq(settings.id, 1)).for("update");
  if (!before) throw new Error("the settings row is missing");
  const [after] = await tx
    .update(settings)
    .set({ ...input, updatedAt: sql`now()` })
    .where(eq(settings.id, 1))
    .returning();
  await audit(tx, actor, "settings.update", "settings", null, profile(before), profile(after!));
  return after!;
}

/** The language switch in the page frame: only the language changes. */
export async function setLanguage(tx: Tx, actor: AuditActor, language: "bn" | "en"): Promise<void> {
  const current = await getSettings(tx);
  if (current.language === language) return;
  await updateSettings(tx, actor, {
    shopName: current.shopName,
    marketArea: current.marketArea,
    phone: current.phone,
    address: current.address,
    language,
    banglaDigits: current.banglaDigits,
    roundOffRule: current.roundOffRule as 1 | 5 | 10,
  });
}
