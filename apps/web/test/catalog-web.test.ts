import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { database } from "../src/server/db";
import type { AuditActor } from "../src/server/posting";
import { addFitment, updateFitment } from "../src/server/services/catalog";
import {
  addAlias,
  addPartNumber,
  addVehicle,
  aliasInput,
  createPart,
  partInput,
  removeAlias,
  removePartNumber,
  updatePart,
  vehicleInput,
} from "../src/server/services/catalog-edit";
import { listAliases, partDetail, searchParts } from "../src/server/services/catalog-reads";
import { editCustomer } from "../src/server/services/parties";
import {
  customerDetail,
  listCustomers,
  listSuppliers,
  supplierDetail,
} from "../src/server/services/party-reads";
import { createTestShop, failedChecks, first, inCi, type TestShop } from "./harness";

// The web dashboard's catalog and parties (DokaanBondhu spec D193, C2): search by name, number, shop word and car
// model; a new part and its numbers, words and fitment; vehicles; and the ledgers, which must agree with the balances.
// Every change keeps db:check passing and writes its audit and change-log rows.

describe.skipIf(!inCi)("catalog and parties on the web", () => {
  let shop: TestShop;
  let actor: AuditActor;
  const db = () => database();
  const inTx = <T>(
    change: (tx: Parameters<Parameters<ReturnType<typeof database>["transaction"]>[0]>[0]) => Promise<T>,
  ) => db().transaction(change);

  beforeAll(async () => {
    shop = await createTestShop("catalogweb");
    const owner = await first<{ id: string }>(shop, "select id from users where role = 'owner'");
    actor = { source: "web", userId: owner.id, actingUser: "Shop Owner (demo)" };
  }, 180_000);

  afterAll(async () => shop?.drop());

  const names = async (query: string, car?: Parameters<typeof searchParts>[2]) =>
    (await searchParts(db(), query, car)).map((hit) => hit.name_en);

  it("finds parts by English or Bangla name, by number however it is typed, and by a shop word", async () => {
    expect(await names("front brake pad")).toContain("Front brake pad set");
    expect(await names("ব্রেক প্যাড")).toContain("Front brake pad set");
    for (const typed of ["04465-10010", "04465 10010", "0446510010", "0446510"]) {
      expect(await names(typed)).toContain("Front brake pad set");
    }
    const brek = await searchParts(db(), "brek"); // a category word: every Brakes part
    const brakes = await first<{ count: string }>(
      shop,
      `select count(*) from parts p join categories c on c.id = p.category_id
       where c.name_en = 'Brakes' and p.deleted_at is null`,
    );
    expect(brek).toHaveLength(Number(brakes.count));
    expect(await names("no-such-part-xyz")).toEqual([]);
  });

  it("narrows to a car model and year through the fitment", async () => {
    // 04465-10010 fits the Axio of 2012-2017 only
    const pad = (await searchParts(db(), "04465-10010"))[0]!.id;
    const ids = async (year: number) =>
      (await searchParts(db(), "pad", { make: "Toyota", model: "Axio", year })).map((hit) => hit.id);
    const axio2014 = await names("pad", { make: "Toyota", model: "Axio", year: 2014 });
    expect(await ids(2014)).toContain(pad);
    expect(await ids(2009)).not.toContain(pad);
    const any = await searchParts(db(), "", { make: "Toyota", model: "Axio" });
    expect(any.length).toBeGreaterThan(axio2014.length - 1);
  });

  it("adds a part with no stock, its numbers, words and fitment, each with audit and change-log rows", async () => {
    const category = await first<{ id: string }>(shop, "select id from categories where name_en = 'Brakes'");
    const input = partInput.parse({
      nameEn: "Test rear shoe",
      nameBn: "টেস্ট পেছনের শু",
      categoryId: category.id,
      brandId: null,
      newBrand: "TestBrand",
      vehicleType: "car",
      quality: "aftermarket",
      position: "rear",
      unit: "set",
      packSize: null,
      rackLocation: "Z-9",
      retailPrice: 2500,
      garagePrice: null,
      reorderLevel: "2",
      notes: "",
      isActive: true,
    });
    const id = await inTx((tx) => createPart(tx, actor, input, "TS-0001"));
    let detail = (await partDetail(db(), id))!;
    expect(detail.part).toMatchObject({
      name_en: "Test rear shoe",
      brand: "TestBrand",
      stock: "0.000",
      garage_price: null,
    });
    expect(detail.numbers).toMatchObject([{ number: "TS-0001", is_main: true }]);
    expect(await names("ts 0001")).toEqual(["Test rear shoe"]);

    await inTx((tx) =>
      addPartNumber(tx, actor, id, { number: "TS-0002", kind: "oem", brand: null, isMain: true }),
    );
    await expect(
      inTx((tx) =>
        addPartNumber(tx, actor, id, { number: "ts 0002", kind: "oem", brand: null, isMain: false }),
      ),
    ).rejects.toMatchObject({ code: "NUMBER_EXISTS" });
    detail = (await partDetail(db(), id))!;
    expect(detail.numbers.filter((n) => n.is_main).map((n) => n.number)).toEqual(["TS-0002"]);
    await inTx((tx) => removePartNumber(tx, actor, detail.numbers.find((n) => n.number === "TS-0001")!.id));

    await inTx((tx) =>
      addAlias(tx, actor, aliasInput.parse({ aliasText: "shoe-test", partId: id, categoryId: null })),
    );
    await expect(
      inTx((tx) =>
        addAlias(tx, actor, aliasInput.parse({ aliasText: "SHOE-TEST", partId: id, categoryId: null })),
      ),
    ).rejects.toMatchObject({ code: "ALIAS_EXISTS" });
    expect(await names("shoe-test")).toEqual(["Test rear shoe"]);
    expect(aliasInput.safeParse({ aliasText: "x", partId: id, categoryId: category.id }).success).toBe(false);

    const vehicleId = await inTx((tx) =>
      addVehicle(
        tx,
        actor,
        vehicleInput.parse({
          vehicleType: "car",
          make: "Toyota",
          model: "Testcar",
          yearFrom: 2015,
          yearTo: null,
          engineCode: "2NR",
          body: "",
        }),
      ),
    );
    await expect(
      inTx((tx) =>
        addVehicle(tx, actor, {
          vehicleType: "car",
          make: "toyota",
          model: "TESTCAR",
          yearFrom: 2015,
          yearTo: null,
          engineCode: "2nr",
          body: null,
        }),
      ),
    ).rejects.toMatchObject({ code: "VEHICLE_EXISTS" });
    expect(
      vehicleInput.safeParse({
        ...{ vehicleType: "car", make: "A", model: "B", engineCode: "", body: "" },
        yearFrom: 2015,
        yearTo: 2010,
      }).success,
    ).toBe(false);

    const context = { now: new Date(), query: undefined, dryRun: false };
    const added = await inTx((tx) =>
      addFitment({ tx, actor, params: undefined, ...context, body: { part_id: id, vehicle_id: vehicleId } }),
    );
    const fitment = added.body.fitment as { id: string; source: string };
    expect(fitment.source).toBe("owner");
    expect(await names("", { make: "Toyota", model: "Testcar", year: 2020 })).toEqual(["Test rear shoe"]);
    await inTx((tx) =>
      updateFitment({ tx, actor, params: { id: fitment.id }, ...context, body: { deleted: true } }),
    );
    expect(await names("", { make: "Toyota", model: "Testcar" })).toEqual([]);

    await inTx((tx) =>
      updatePart(tx, actor, id, {
        ...input,
        newBrand: null,
        brandId: null,
        retailPrice: 2600,
        isActive: false,
      }),
    );
    detail = (await partDetail(db(), id))!;
    expect(detail.part).toMatchObject({ retail_price: "2600", is_active: false, brand: null });

    const audits = await shop.admin.query<{ action: string; source: string }>(
      "select action, source from audit_logs where user_id = $1 order by id",
      [actor.source === "web" ? actor.userId : ""],
    );
    expect(audits.rows.map((row) => row.action)).toEqual([
      "brand.create",
      "part.create",
      "part_number.create",
      "part_number.create",
      "part_number.delete",
      "alias.create",
      "vehicle.create",
      "fitment.create",
      "fitment.update",
      "part.update",
    ]);
    expect(new Set(audits.rows.map((row) => row.source))).toEqual(new Set(["web"]));
    const logged = await first<{ count: string }>(
      shop,
      "select count(*) from change_log where entity in ('parts', 'stock_levels', 'part_numbers', 'part_aliases', 'vehicles', 'fitments', 'brands') and entity_id in (select id from parts where id = $1 union select id from part_numbers where part_id = $1 union select id from part_aliases where part_id = $1 union select $1)",
      [id],
    );
    expect(Number(logged.count)).toBeGreaterThan(5);
    expect(await failedChecks(shop)).toEqual([]);

    const alias = (await listAliases(db())).find((row) => row.alias_text === "shoe-test")!;
    await inTx((tx) => removeAlias(tx, actor, alias.id));
    expect(await names("shoe-test")).toEqual([]);
  });

  it("shows every customer's and supplier's ledger ending at the balance the row keeps", async () => {
    for (const customer of await listCustomers(db())) {
      const detail = (await customerDetail(db(), customer.id))!;
      const newest = detail.ledger.lines[0];
      expect(newest?.balance_after ?? "0").toBe(customer.due_balance);
    }
    for (const supplier of await listSuppliers(db())) {
      const detail = (await supplierDetail(db(), supplier.id))!;
      expect(detail.ledger.lines[0]?.balance_after ?? "0").toBe(supplier.payable_balance);
    }
    const withSale = await first<{ customer_id: string }>(
      shop,
      "select customer_id from customer_ledger where ref_type = 'sale' limit 1",
    );
    const detail = (await customerDetail(db(), withSale.customer_id))!;
    expect(detail.ledger.lines.find((line) => line.entry_type === "sale")?.reference).toMatch(
      /^[A-Z0-9]+-\d+$/,
    );
    expect((await listCustomers(db(), "zzzz-nobody")).length).toBe(0);
  });

  it("changes a customer's price tier and credit limit, keeping the due", async () => {
    const customer = (await listCustomers(db())).find((c) => c.price_tier === "retail")!;
    await inTx((tx) =>
      editCustomer(tx, actor, customer.id, {
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        price_tier: "garage",
        credit_limit_taka: 50000,
      }),
    );
    const after = (await customerDetail(db(), customer.id))!.customer;
    expect(after).toMatchObject({
      price_tier: "garage",
      credit_limit: "50000",
      due_balance: customer.due_balance,
    });
    expect(await failedChecks(shop)).toEqual([]);
  });
});
