-- Roles, grants and row-level security (spec 5.3). Roles are created without a password: migration files cannot
-- read environment variables, so `npm run db:roles` sets the passwords.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_api') THEN
    CREATE ROLE app_api LOGIN NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dokaanbondhu_ro') THEN
    CREATE ROLE dokaanbondhu_ro LOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
ALTER ROLE dokaanbondhu_ro SET default_transaction_read_only = on;
ALTER ROLE dokaanbondhu_ro SET statement_timeout = '5s';
ALTER ROLE dokaanbondhu_ro SET idle_in_transaction_session_timeout = '10s';

GRANT USAGE ON SCHEMA public TO app_api, dokaanbondhu_ro;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_api;
GRANT DELETE ON idempotency_keys TO app_api;          -- 7-day clean-up only
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_api;
GRANT SELECT ON parts, part_numbers, part_aliases, categories, brands, vehicles,
  fitments, stock_levels, stock_movements, customers, customer_ledger, sales,
  sale_items, sale_payments, customer_payments, returns, return_items, suppliers,
  supplier_ledger, supplier_payments, purchases, purchase_items, accounts,
  account_transactions, daily_closings, expense_categories, expenses, cheques
  TO dokaanbondhu_ro;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public    -- later tables: app_api only
  GRANT SELECT, INSERT, UPDATE ON TABLES TO app_api;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_api;

DO $$ DECLARE t text; BEGIN                       -- every table: RLS + api_all
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY api_all ON %I FOR ALL TO app_api
                    USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
DO $$ DECLARE t text; BEGIN                       -- granted tables: ai_read
  FOREACH t IN ARRAY ARRAY['parts', 'part_numbers', 'part_aliases', 'categories', 'brands', 'vehicles',
    'fitments', 'stock_levels', 'stock_movements', 'customers', 'customer_ledger', 'sales',
    'sale_items', 'sale_payments', 'customer_payments', 'returns', 'return_items', 'suppliers',
    'supplier_ledger', 'supplier_payments', 'purchases', 'purchase_items', 'accounts',
    'account_transactions', 'daily_closings', 'expense_categories', 'expenses', 'cheques'] LOOP
    EXECUTE format('CREATE POLICY ai_read ON %I FOR SELECT TO dokaanbondhu_ro
                    USING (true)', t);
  END LOOP;
END $$;
