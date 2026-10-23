import { describe, expect, it } from "vitest";
import { poolConfig } from "../src/client";

// The pool's settings (DokaanBondhu spec D209): on Vercel the database certificate comes as text, since the file the
// URL names exists only on Render and the laptop; everywhere else the URL is used as it is.

const RENDER_URL =
  "postgresql://app_api.ref:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres" +
  "?sslmode=verify-full&sslrootcert=/opt/render/project/src/certs/supabase-root-2021.crt";
const CA = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n";

describe("the database pool's settings", () => {
  it("keeps the URL as it is when no certificate is given (laptop, Render, CI)", () => {
    expect(poolConfig(RENDER_URL, 10)).toEqual({ connectionString: RENDER_URL, max: 10 });
  });

  it("verifies the server with the given certificate, and drops the URL's file path and ssl mode", () => {
    const config = poolConfig(RENDER_URL, 2, { ca: CA });
    expect(config.ssl).toEqual({ ca: CA, rejectUnauthorized: true });
    expect(config.max).toBe(2);
    const url = new URL(config.connectionString!);
    expect(url.searchParams.has("sslmode")).toBe(false);
    expect(url.searchParams.has("sslrootcert")).toBe(false);
    expect(url.host).toBe("aws-1-ap-southeast-1.pooler.supabase.com:5432");
    expect(url.username).toBe("app_api.ref");
    expect(url.password).toBe("secret");
  });

  it("keeps any other setting of the URL", () => {
    const config = poolConfig(
      "postgresql://u:p@h:6543/postgres?application_name=geargrid&sslmode=require",
      2,
      {
        ca: CA,
      },
    );
    expect(new URL(config.connectionString!).search).toBe("?application_name=geargrid");
  });
});
