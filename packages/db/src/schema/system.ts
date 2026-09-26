import {
  bigserial,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { commonColumns, oneOf, timestamptz } from "./columns";
import { AUDIT_LOG_SOURCES, CHANGE_LOG_OPS, SYNC_COMMAND_STATUSES } from "./enums";
import { devices } from "./shop";

// System tables (spec 5.2). Only import_jobs has the common columns.

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    userId: uuid("user_id"),
    apiKeyId: uuid("api_key_id"),
    deviceId: uuid("device_id"),
    source: text("source").notNull(),
    actingUser: text("acting_user"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("audit_logs_source_check", oneOf(t.source, AUDIT_LOG_SOURCES)),
    index("audit_logs_entity_idx").on(t.entity, t.entityId),
  ],
);

export const changeLog = pgTable(
  "change_log",
  {
    seq: bigserial("seq", { mode: "bigint" }).primaryKey(),
    entity: text("entity").notNull(),
    entityId: uuid("entity_id").notNull(),
    op: text("op").notNull(),
    changedAt: timestamptz("changed_at").notNull().defaultNow(),
  },
  (t) => [check("change_log_op_check", oneOf(t.op, CHANGE_LOG_OPS))],
);

/** Used from slice C: the phone's offline commands, keyed by their idempotency key. */
export const syncCommands = pgTable(
  "sync_commands",
  {
    id: uuid("id").primaryKey(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull(),
    result: jsonb("result"),
    receivedAt: timestamptz("received_at").notNull().defaultNow(),
  },
  (t) => [
    check("sync_commands_status_check", oneOf(t.status, SYNC_COMMAND_STATUSES)),
    index("sync_commands_device_id_idx").on(t.deviceId),
  ],
);

/** The response is written before the claiming transaction commits, so a committed row always has it. */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: text("key").notNull(),
    scope: text("scope").notNull(), // method + route pattern
    requestHash: text("request_hash").notNull(),
    responseStatus: smallint("response_status"),
    responseBody: jsonb("response_body"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.scope] }),
    index("idempotency_keys_created_at_idx").on(t.createdAt),
  ],
);

/** Used from slice C. */
export const importJobs = pgTable("import_jobs", {
  ...commonColumns(),
  kind: text("kind").notNull(),
  filePath: text("file_path"),
  status: text("status").notNull(),
  rowsOk: integer("rows_ok"),
  rowsFailed: integer("rows_failed"),
  report: jsonb("report"),
});
