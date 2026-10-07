import { describe, expect, it } from "vitest";
import { GET as openapi } from "../../app/api/openapi.json/route";
import { GET as health } from "../../app/api/v1/health/route";
import { API_VERSION, buildOpenApiDocument } from "./registry";

// Day one of slice B (spec 6.9): the generator exports the error shape and GET /api/v1/health before any other route.

describe("OpenAPI document", () => {
  it("is OpenAPI 3.1 with the error schema, the key scheme and the health route without a key", () => {
    const document = buildOpenApiDocument();
    expect(document.openapi).toBe("3.1.0");
    expect(document.info.version).toBe(API_VERSION);
    expect(document.components?.schemas?.Error).toMatchObject({
      type: "object",
      properties: { error: { type: "object" } },
    });
    expect(document.components?.securitySchemes?.ApiKeyAuth).toEqual({
      type: "apiKey",
      in: "header",
      name: "X-Api-Key",
    });
    const getHealth = document.paths?.["/api/v1/health"]?.get;
    expect(getHealth?.operationId).toBe("getHealth");
    expect(getHealth?.security).toBeUndefined();
  });

  it("is served at /api/openapi.json, and health answers ok with the version and time", async () => {
    expect(await openapi().json()).toMatchObject({ openapi: "3.1.0", paths: { "/api/v1/health": {} } });
    const body = (await health().json()) as { status: string; version: string; time: string };
    expect(body).toMatchObject({ status: "ok", version: API_VERSION });
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
  });
});
