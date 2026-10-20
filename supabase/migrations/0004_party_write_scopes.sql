-- New customers and suppliers by voice or chat (DokaanBondhu D173): every key that holds all seven earlier scopes (the
-- DokaanBondhu key) also gets customers:write and suppliers:write, so the shop's key needs no reset.
UPDATE "api_keys" SET "scopes" = "scopes" || ARRAY['customers:write', 'suppliers:write']::text[], "updated_at" = now(), "version" = "version" + 1 WHERE "scopes" @> ARRAY['read', 'sales:write', 'payments:write', 'purchases:write', 'returns:write', 'prices:write', 'fitments:write']::text[] AND NOT "scopes" @> ARRAY['customers:write']::text[];
