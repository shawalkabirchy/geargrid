import type { Db } from "@geargrid/db";
import { sql, type SQL } from "drizzle-orm";
import type { Tx } from "../db";

// The catalog as the web dashboard reads it (GearGrid plan 2.1-2.3, 8.1): search by name, shop word, part number or car
// model; one part with its numbers, aliases, fitment and stock history; the vehicle list.
//
// Search: every word of the query must match the part's English or Bangla name, one of its numbers (spaces, dashes
// and case ignored), or a shop word (an alias of the part or of its category, matched whole). A car model narrows the
// result to parts fitted to that model, in that year when one is given.

type Reader = Db | Tx;

export type PartHit = {
  id: string;
  name_en: string;
  name_bn: string | null;
  main_number: string | null;
  brand: string | null;
  quality: string;
  position: string | null;
  unit: string;
  rack_location: string | null;
  retail_price: string;
  garage_price: string | null;
  stock: string;
  is_active: boolean;
};

export interface CarFilter {
  make: string;
  model: string;
  year?: number | undefined;
}

export const SEARCH_LIMIT = 100;

/** Upper case without spaces or dashes, as `part_numbers.number_normalized` is stored. */
export function normalizePartNumber(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, "");
}

const like = (value: string) => `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function wordMatches(word: string): SQL {
  const number = normalizePartNumber(word);
  return sql`(p.name_en ilike ${like(word)} or coalesce(p.name_bn, '') ilike ${like(word)}
    or (${number.length >= 3} and exists (select 1 from part_numbers n where n.part_id = p.id
        and n.deleted_at is null and n.number_normalized like ${like(number)}))
    or exists (select 1 from part_aliases a where a.deleted_at is null and lower(a.alias_text) = lower(${word})
        and (a.part_id = p.id or a.category_id = p.category_id)))`;
}

export async function searchParts(db: Reader, query: string, car?: CarFilter): Promise<PartHit[]> {
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  const conditions: SQL[] = [sql`p.deleted_at is null`];
  if (words.length > 0) {
    // every word matches, or the whole query is one part number typed with spaces ("04465 33450")
    const whole = normalizePartNumber(query);
    const asNumber = sql`(${whole.length >= 3} and exists (select 1 from part_numbers n where n.part_id = p.id
        and n.deleted_at is null and n.number_normalized like ${like(whole)}))`;
    conditions.push(sql`((${sql.join(words.map(wordMatches), sql` and `)}) or ${asNumber})`);
  }
  if (car) {
    conditions.push(sql`exists (select 1 from fitments f join vehicles v on v.id = f.vehicle_id
      where f.part_id = p.id and f.deleted_at is null and v.deleted_at is null
        and lower(v.make) = lower(${car.make}) and lower(v.model) = lower(${car.model})
        and (${car.year ?? null}::int is null
             or ${car.year ?? null}::int between v.year_from and coalesce(v.year_to, 9999)))`);
  }
  const result = await db.execute<PartHit>(sql`
    select p.id, p.name_en, p.name_bn, p.quality, p.position, p.unit, p.rack_location, p.is_active,
           p.retail_price, p.garage_price, coalesce(l.quantity, 0) as stock, b.name as brand,
           (select n.number from part_numbers n where n.part_id = p.id and n.deleted_at is null
            order by n.is_main desc, n.created_at limit 1) as main_number
    from parts p
    left join stock_levels l on l.part_id = p.id
    left join brands b on b.id = p.brand_id
    where ${sql.join(conditions, sql` and `)}
    order by p.is_active desc, p.name_en
    limit ${SEARCH_LIMIT}`);
  return result.rows;
}

export type CarModel = {
  vehicle_type: string;
  make: string;
  model: string;
};

/** The models of the vehicle list, for the "by car model" picker. */
export async function carModels(db: Reader): Promise<CarModel[]> {
  const result = await db.execute<CarModel>(sql`
    select distinct vehicle_type, make, model from vehicles where deleted_at is null
    order by make, model`);
  return result.rows;
}

export type VehicleRow = {
  id: string;
  vehicle_type: string;
  make: string;
  model: string;
  year_from: number;
  year_to: number | null;
  engine_code: string | null;
  body: string | null;
  source: string;
  parts: string;
};

export async function listVehicles(db: Reader): Promise<VehicleRow[]> {
  const result = await db.execute<VehicleRow>(sql`
    select v.id, v.vehicle_type, v.make, v.model, v.year_from, v.year_to, v.engine_code, v.body, v.source,
           (select count(*) from fitments f where f.vehicle_id = v.id and f.deleted_at is null) as parts
    from vehicles v where v.deleted_at is null
    order by v.make, v.model, v.year_from`);
  return result.rows;
}

export type Option = {
  id: string;
  name: string;
};

export async function categoryOptions(db: Reader): Promise<Option[]> {
  const result = await db.execute<Option>(sql`
    select id, name_en || coalesce(' / ' || name_bn, '') as name from categories where deleted_at is null
    order by name_en`);
  return result.rows;
}

export async function brandOptions(db: Reader): Promise<Option[]> {
  const result = await db.execute<Option>(sql`
    select id, name from brands where deleted_at is null order by name`);
  return result.rows;
}

export interface PartDetail {
  part: {
    id: string;
    name_en: string;
    name_bn: string | null;
    category_id: string;
    category: string;
    brand_id: string | null;
    brand: string | null;
    vehicle_type: string;
    quality: string;
    position: string | null;
    unit: string;
    pack_size: string | null;
    rack_location: string | null;
    retail_price: string;
    garage_price: string | null;
    avg_cost: string;
    reorder_level: string;
    notes: string | null;
    is_active: boolean;
    stock: string;
  };
  numbers: { id: string; number: string; kind: string; brand: string | null; is_main: boolean }[];
  aliases: { id: string; alias_text: string }[];
  categoryAliases: { id: string; alias_text: string }[];
  fitments: {
    id: string;
    vehicle_id: string;
    vehicle: string;
    year_from: number;
    year_to: number | null;
    engine_code: string | null;
    note: string | null;
    source: string;
    verified: boolean;
  }[];
  movements: {
    id: string;
    created_at: Date;
    reason: string;
    qty_change: string;
    unit_cost: string | null;
    invoice_no: string | null;
  }[];
}

export const MOVEMENT_LIMIT = 50;

export async function partDetail(db: Reader, id: string): Promise<PartDetail | null> {
  const [part] = (
    await db.execute<PartDetail["part"]>(sql`
    select p.id, p.name_en, p.name_bn, p.category_id, c.name_en as category, p.brand_id, b.name as brand,
           p.vehicle_type, p.quality, p.position, p.unit, p.pack_size, p.rack_location, p.retail_price,
           p.garage_price, p.avg_cost, p.reorder_level, p.notes, p.is_active, coalesce(l.quantity, 0) as stock
    from parts p
    join categories c on c.id = p.category_id
    left join brands b on b.id = p.brand_id
    left join stock_levels l on l.part_id = p.id
    where p.id = ${id} and p.deleted_at is null`)
  ).rows;
  if (!part) return null;
  const numbers = await db.execute<PartDetail["numbers"][number]>(sql`
    select id, number, kind, brand, is_main from part_numbers where part_id = ${id} and deleted_at is null
    order by is_main desc, created_at`);
  const aliases = await db.execute<PartDetail["aliases"][number]>(sql`
    select id, alias_text from part_aliases where part_id = ${id} and deleted_at is null order by alias_text`);
  const categoryAliases = await db.execute<PartDetail["aliases"][number]>(sql`
    select id, alias_text from part_aliases where category_id = ${part.category_id} and deleted_at is null
    order by alias_text`);
  const fitments = await db.execute<PartDetail["fitments"][number]>(sql`
    select f.id, f.vehicle_id, v.make || ' ' || v.model as vehicle, v.year_from, v.year_to, v.engine_code,
           f.note, f.source, f.verified
    from fitments f join vehicles v on v.id = f.vehicle_id
    where f.part_id = ${id} and f.deleted_at is null
    order by v.make, v.model, v.year_from`);
  const movements = await db.execute<PartDetail["movements"][number]>(sql`
    select m.id, m.created_at, m.reason, m.qty_change, m.unit_cost,
           case when m.ref_type in ('sale', 'void') then s.invoice_no end as invoice_no
    from stock_movements m
    left join sales s on m.ref_type in ('sale', 'void') and s.id = m.ref_id
    where m.part_id = ${id} and m.deleted_at is null
    order by m.created_at desc, m.id desc
    limit ${MOVEMENT_LIMIT}`);
  return {
    part,
    numbers: numbers.rows,
    aliases: aliases.rows,
    categoryAliases: categoryAliases.rows,
    fitments: fitments.rows,
    movements: movements.rows.map((row) => ({ ...row, created_at: new Date(row.created_at) })),
  };
}

export type AliasRow = {
  id: string;
  alias_text: string;
  target: string;
  part_id: string | null;
};

/** Every shop word: those of a category (finding all its parts) and those of one part. */
export async function listAliases(db: Reader): Promise<AliasRow[]> {
  const result = await db.execute<AliasRow>(sql`
    select a.id, a.alias_text, a.part_id, coalesce(c.name_en, p.name_en) as target
    from part_aliases a
    left join categories c on c.id = a.category_id
    left join parts p on p.id = a.part_id
    where a.deleted_at is null
    order by (a.part_id is not null), coalesce(c.name_en, p.name_en), a.alias_text`);
  return result.rows;
}
