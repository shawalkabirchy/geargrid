ALTER TABLE "purchase_items" ADD COLUMN "avg_cost_before" bigint;--> statement-breakpoint
-- Existing lines get their part's current average, so reversing one of them changes nothing (the rule before D93).
UPDATE "purchase_items" SET "avg_cost_before" = "parts"."avg_cost" FROM "parts" WHERE "parts"."id" = "purchase_items"."part_id";--> statement-breakpoint
ALTER TABLE "purchase_items" ALTER COLUMN "avg_cost_before" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_avg_cost_before_check" CHECK ("purchase_items"."avg_cost_before" >= 0);
