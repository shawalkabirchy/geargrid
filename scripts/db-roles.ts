import pg from "pg";
import { z } from "zod";
import { isMain, log, readEnv, runMain } from "./lib/cli";

// npm run db:roles (spec 5.3): sets the passwords of app_api and dokaanbondhu_ro. Migration files are plain SQL
// and cannot read environment variables, so the roles are created without a password and this step sets them.

export async function setRolePasswords(
  client: pg.ClientBase,
  passwords: { appApi: string; dokaanRo: string },
): Promise<void> {
  const roles: [string, string][] = [
    ["app_api", passwords.appApi],
    ["dokaanbondhu_ro", passwords.dokaanRo],
  ];
  for (const [role, password] of roles) {
    await client.query(
      `ALTER ROLE ${client.escapeIdentifier(role)} WITH LOGIN PASSWORD ${client.escapeLiteral(password)}`,
    );
  }
}

if (isMain(import.meta.url)) {
  runMain(async () => {
    const env = readEnv({
      MIGRATION_DATABASE_URL: z.string().min(1),
      APP_API_PASSWORD: z.string().min(8),
      DOKAAN_RO_PASSWORD: z.string().min(8),
    });
    const client = new pg.Client({ connectionString: env.MIGRATION_DATABASE_URL });
    await client.connect();
    try {
      await setRolePasswords(client, { appApi: env.APP_API_PASSWORD, dokaanRo: env.DOKAAN_RO_PASSWORD });
      log("db:roles: passwords set for app_api and dokaanbondhu_ro");
    } finally {
      await client.end();
    }
  });
}
