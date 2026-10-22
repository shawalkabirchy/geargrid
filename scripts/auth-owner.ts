import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SEED_OWNER_AUTH_USER_ID } from "../supabase/seed/seed";
import { isMain, log, readEnv, runMain } from "./lib/cli";

// npm run auth:owner (DokaanBondhu spec D193): makes the seed owner's web login in Supabase Auth, with the seed's
// fixed auth user ID, so `users.auth_user_id` matches and a reset or reseed keeps the login working. Run once per
// Supabase project; run again to set a new password. Needs the project's secret key, which never leaves the laptop.

const OWNER_EMAIL = "owner@demo-auto-parts.test";

if (isMain(import.meta.url)) {
  runMain(async () => {
    const env = readEnv({
      SUPABASE_URL: z.string().url(),
      SUPABASE_SECRET_KEY: z.string().min(20),
      OWNER_PASSWORD: z.string().min(12, "at least 12 characters"),
    });
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const existing = await supabase.auth.admin.getUserById(SEED_OWNER_AUTH_USER_ID);
    if (existing.data.user) {
      const { error } = await supabase.auth.admin.updateUserById(SEED_OWNER_AUTH_USER_ID, {
        password: env.OWNER_PASSWORD,
      });
      if (error) throw error;
      log(`The owner's login (${existing.data.user.email}) has a new password.`);
      return;
    }
    const { error } = await supabase.auth.admin.createUser({
      id: SEED_OWNER_AUTH_USER_ID,
      email: OWNER_EMAIL,
      password: env.OWNER_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    log(`The owner's login is made: ${OWNER_EMAIL}`);
  });
}
