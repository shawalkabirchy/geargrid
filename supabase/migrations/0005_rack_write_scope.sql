-- A part's rack by voice or chat (DokaanBondhu D195): every key that holds all nine earlier scopes (the DokaanBondhu
-- key) also gets racks:write, so the shop's key needs no reset.
UPDATE "api_keys" SET "scopes" = "scopes" || ARRAY['racks:write']::text[], "updated_at" = now(), "version" = "version" + 1 WHERE "scopes" @> ARRAY['read', 'sales:write', 'payments:write', 'purchases:write', 'returns:write', 'prices:write', 'fitments:write', 'customers:write', 'suppliers:write']::text[] AND NOT "scopes" @> ARRAY['racks:write']::text[];
