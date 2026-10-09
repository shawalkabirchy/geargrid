-- Two price tiers, retail and garage (the owner's paikari price), and two customer types (D144).
ALTER TABLE "parts" DROP CONSTRAINT "parts_wholesale_price_check";--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_type_check";--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_price_tier_check";--> statement-breakpoint
ALTER TABLE "sale_items" DROP CONSTRAINT "sale_items_price_tier_check";--> statement-breakpoint
ALTER TABLE "parts" DROP COLUMN "wholesale_price";--> statement-breakpoint
-- Wholesale customers become garage customers; past sale lines keep their prices and only change the label.
INSERT INTO "change_log" ("entity", "entity_id", "op") SELECT 'customers', "id", 'upsert' FROM "customers" WHERE "type" = 'wholesale' OR "price_tier" = 'wholesale';--> statement-breakpoint
UPDATE "customers" SET "type" = CASE WHEN "type" = 'wholesale' THEN 'garage' ELSE "type" END, "price_tier" = CASE WHEN "price_tier" = 'wholesale' THEN 'garage' ELSE "price_tier" END, "updated_at" = now(), "version" = "version" + 1 WHERE "type" = 'wholesale' OR "price_tier" = 'wholesale';--> statement-breakpoint
UPDATE "sale_items" SET "price_tier" = 'garage' WHERE "price_tier" = 'wholesale';--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_type_check" CHECK ("customers"."type" in ('retail', 'garage'));--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_price_tier_check" CHECK ("customers"."price_tier" in ('retail', 'garage'));--> statement-breakpoint
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_price_tier_check" CHECK ("sale_items"."price_tier" in ('retail', 'garage'));
