import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as addFitment } from "../app/api/v1/fitments/route";
import { GET as getFitment, PATCH as updateFitment } from "../app/api/v1/fitments/[id]/route";
import { PATCH as updatePrice } from "../app/api/v1/parts/[id]/price/route";
import { call, createTestShop, failedChecks, first, inCi, NO_READ_KEY, type TestShop } from "./harness";

// Price changes and fitment links (spec 6.5, 6.10): the previous prices come back for an undo, a link cannot be added
// twice, and { deleted: true } removes it.

describe.skipIf(!inCi)("prices and fitments", () => {
  let shop: TestShop;
  const part = { id: "", retail: 0, garage: null as number | null, wholesale: null as number | null };
  const link = { partId: "", vehicleId: "" };

  const errorCode = (answer: { body: Record<string, unknown> }) =>
    (answer.body.error as { code: string }).code;

  beforeAll(async () => {
    shop = await createTestShop("catalog");
    const row = await first<{
      id: string;
      retail_price: string;
      garage_price: string | null;
      wholesale_price: string | null;
    }>(
      shop,
      "select id, retail_price, garage_price, wholesale_price from parts where deleted_at is null order by name_en limit 1",
    );
    part.id = row.id;
    part.retail = Number(row.retail_price);
    part.garage = row.garage_price === null ? null : Number(row.garage_price);
    part.wholesale = row.wholesale_price === null ? null : Number(row.wholesale_price);
    const pair = await first<{ part_id: string; vehicle_id: string }>(
      shop,
      `select p.id as part_id, v.id as vehicle_id from parts p cross join vehicles v
       where p.deleted_at is null and v.deleted_at is null
         and not exists (select 1 from fitments f where f.part_id = p.id and f.vehicle_id = v.id and f.deleted_at is null)
       order by p.name_en, v.model limit 1`,
    );
    link.partId = pair.part_id;
    link.vehicleId = pair.vehicle_id;
  }, 180_000);

  afterAll(async () => shop?.drop());

  it("changes a price, keeps the previous ones, and the previous ones put it back", async () => {
    const previous = {
      retail_price_taka: part.retail,
      garage_price_taka: part.garage,
      wholesale_price_taka: part.wholesale,
    };
    const changed = await call(updatePrice, {
      method: "PATCH",
      params: { id: part.id },
      body: { retail_price_taka: part.retail + 100, garage_price_taka: null },
    });
    expect(changed.status).toBe(200);
    expect(changed.body).toEqual({
      part: {
        id: part.id,
        retail_price_taka: part.retail + 100,
        garage_price_taka: null,
        wholesale_price_taka: part.wholesale,
      },
      previous,
    });
    expect(await first(shop, "select action from audit_logs where entity_id = $1", [part.id])).toEqual({
      action: "part.price_update",
    });
    const undone = await call(updatePrice, { method: "PATCH", params: { id: part.id }, body: previous });
    expect(undone.body.part).toEqual({ id: part.id, ...previous });
  });

  it("refuses a price change without prices:write, without any price, or for an unknown part", async () => {
    const forbidden = await call(updatePrice, {
      method: "PATCH",
      params: { id: part.id },
      body: { retail_price_taka: 1 },
      key: NO_READ_KEY,
    });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error).toMatchObject({
      code: "FORBIDDEN_SCOPE",
      details: { required: "prices:write" },
    });
    expect(errorCode(await call(updatePrice, { method: "PATCH", params: { id: part.id }, body: {} }))).toBe(
      "VALIDATION_FAILED",
    );
    expect(
      errorCode(
        await call(updatePrice, {
          method: "PATCH",
          params: { id: "0192e011-2a4c-7f3e-b5d1-9c8a7e6f5d40" },
          body: { retail_price_taka: 1 },
        }),
      ),
    ).toBe("NOT_FOUND");
  });

  it("adds a link once, removes it with deleted: true, and allows it again after", async () => {
    const body = { part_id: link.partId, vehicle_id: link.vehicleId, note: "Checked by the owner" };
    const added = await call(addFitment, { method: "POST", path: "/api/v1/fitments", body });
    expect(added.status).toBe(201);
    const fitment = added.body.fitment as { id: string };
    expect(added.body.fitment).toMatchObject({ source: "ai", verified: false, deleted: false });
    const twice = await call(addFitment, { method: "POST", path: "/api/v1/fitments", body });
    expect(twice.status).toBe(409);
    expect(errorCode(twice)).toBe("FITMENT_EXISTS");

    const removed = await call(updateFitment, {
      method: "PATCH",
      params: { id: fitment.id },
      body: { deleted: true },
    });
    expect(removed.status).toBe(200);
    expect(removed.body.fitment).toMatchObject({ id: fitment.id, deleted: true });
    expect((await call(getFitment, { params: { id: fitment.id } })).status).toBe(404);
    expect((await call(addFitment, { method: "POST", path: "/api/v1/fitments", body })).status).toBe(201);
    expect(
      errorCode(
        await call(addFitment, {
          method: "POST",
          path: "/api/v1/fitments",
          body: { part_id: link.partId, vehicle_id: "0192e011-2a4c-7f3e-b5d1-9c8a7e6f5d40" },
        }),
      ),
    ).toBe("NOT_FOUND");
    expect(await failedChecks(shop)).toEqual([]);
  });
});
