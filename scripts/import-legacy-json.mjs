#!/usr/bin/env node
/**
 * One-off import of the legacy local JSON store into PostgreSQL.
 *
 * Reads:
 *   data/albarka-db.json        → flagship tenant (ten-stacklyra)
 *   data/tenants/<id>.json      → one tenant each
 *
 * Usage (run from the project root; the app must have started once so the schema
 * and the flagship tenant exist):
 *   node --env-file=.env.local scripts/import-legacy-json.mjs             # dry run (default)
 *   node --env-file=.env.local scripts/import-legacy-json.mjs --apply     # write, keep existing rows
 *   node --env-file=.env.local scripts/import-legacy-json.mjs --apply --overwrite
 *                                                                        # write, JSON wins on conflict
 *
 * Each tenant is imported in its own transaction holding the same advisory lock the app
 * uses, so it is safe to run while the app is up. Nothing is ever deleted.
 */
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const OVERWRITE = args.has("--overwrite");
const FLAGSHIP_ID = "ten-stacklyra";
const DATA_DIR = path.join(process.cwd(), "data");

const uri = (process.env.DATABASE_URL || "").trim().replace(/^["']|["']$/g, "");
if (!/^postgres(ql)?:\/\//.test(uri) || uri.includes("[YOUR-DATABASE-PASSWORD]")) {
  console.error("DATABASE_URL is missing or a placeholder. Run with --env-file=.env.local.");
  process.exit(1);
}

const str = (v) => (v === undefined || v === null ? "" : String(v));
const now = new Date().toISOString();

// Must match COLLECTIONS in src/lib/postgres.ts.
const COLLECTIONS = [
  { field: "users", table: "stacklyra_users", idColumn: "id", idOf: (d) => str(d.id), payload: true,
    cols: [["branch_id", "text", (d) => str(d.branchId) || "BRANCH_MAIN"],
           ["username", "text", (d) => (str(d.username) || str(d.email).split("@")[0]).toLowerCase()],
           ["email", "text", (d) => str(d.email).toLowerCase()],
           ["role", "text", (d) => str(d.role)],
           ["updated_at", "text", () => now]] },
  { field: "products", table: "stacklyra_products", idColumn: "id", idOf: (d) => str(d.id), payload: true,
    cols: [["code", "text", (d) => str(d.code)], ["is_archived", "boolean", (d) => Boolean(d.isArchived)],
           ["updated_at", "text", () => now]] },
  { field: "orders", table: "stacklyra_orders", idColumn: "id", idOf: (d) => str(d.id), payload: true,
    cols: [["created_at", "text", (d) => str(d.createdAt)], ["invoice_number", "text", (d) => str(d.invoiceNumber)]] },
  { field: "erpInvoices", table: "stacklyra_invoices", idColumn: "id", idOf: (d) => str(d.id), payload: true,
    cols: [["status", "text", (d) => str(d.status)], ["due_date", "text", (d) => str(d.dueDate)]] },
  { field: "parties", table: "stacklyra_parties", idColumn: "id", idOf: (d) => str(d.id), payload: true,
    cols: [["party_type", "text", (d) => str(d.type)], ["is_archived", "boolean", (d) => Boolean(d.isArchived)]] },
  { field: "ledger", table: "stacklyra_ledger_entries", idColumn: "id", idOf: (d) => str(d.id), payload: true,
    cols: [["party_id", "text", (d) => str(d.partyId)], ["created_at", "text", (d) => str(d.createdAt)]] },
  { field: "documentCounters", table: "stacklyra_document_counters", idColumn: "key", idOf: (d) => str(d.key), payload: false,
    cols: [["seq", "integer", (d) => Number(d.seq) || 0]] },
  { field: "cashierShifts", table: "stacklyra_cashier_shifts", idColumn: "id", idOf: (d) => str(d.id), payload: true,
    cols: [["opened_at", "text", (d) => str(d.openedAt)]] },
  { field: "fiscalPeriods", table: "stacklyra_fiscal_periods", idColumn: "period_key", idOf: (d) => str(d.periodKey), payload: true,
    cols: [] },
  { field: "immutableAuditLogs", table: "stacklyra_immutable_audit_logs", idColumn: "id", idOf: (d) => str(d.id), payload: true,
    cols: [["timestamp", "text", (d) => str(d.timestamp)]] },
];

function readJson(file) {
  for (const candidate of [file, `${file}.bak`]) {
    try {
      if (fs.existsSync(candidate)) return JSON.parse(fs.readFileSync(candidate, "utf-8"));
    } catch {
      console.warn(`  ! could not parse ${path.relative(process.cwd(), candidate)}, trying backup`);
    }
  }
  return null;
}

function collectSources() {
  const sources = [];
  const legacy = readJson(path.join(DATA_DIR, "albarka-db.json"));
  if (legacy) sources.push({ file: "data/albarka-db.json", tenantId: FLAGSHIP_ID, snapshot: legacy });
  const dir = path.join(DATA_DIR, "tenants");
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const snapshot = readJson(path.join(dir, name));
      const tenantId = snapshot?.tenant?.id || name.replace(/\.json$/, "");
      if (snapshot) sources.push({ file: `data/tenants/${name}`, tenantId, snapshot });
    }
  }
  return sources;
}

const sql = postgres(uri, {
  prepare: false,
  max: 2,
  ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(uri) ? false : "require",
  onnotice: () => {},
});

async function importTenant(tx, { tenantId, snapshot }) {
  const report = { inserted: 0, updated: 0, skipped: 0 };
  await tx.unsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`stacklyra:tenant:${tenantId}`]);

  const existing = await tx.unsafe(`SELECT id FROM stacklyra_tenants WHERE id = $1`, [tenantId]);
  if (existing.length === 0) {
    const t = snapshot.tenant;
    if (!t?.id || !t.slug || !t.subscription) {
      throw new Error(`tenant ${tenantId} is not in Postgres and the JSON has no full tenant record; start the app once or create it first`);
    }
    if (APPLY) {
      await tx.unsafe(
        `INSERT INTO stacklyra_tenants (id, slug, name, segment, invoice_prefix, owner_user_id, owner_email,
           status, plan_id, subscription, pra_config, restaurant_tables, servers, stock_monitor,
           waiting_tasks, session_audit_logs, idempotency_records, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,$17::jsonb,$18,$19)`,
        [t.id, t.slug, t.name, t.segment || "HYBRID", t.invoicePrefix || "SL", t.ownerUserId, t.ownerEmail,
         t.status || "TRIALING", t.planId || "growth", t.subscription,
         snapshot.praConfig || {}, snapshot.restaurantTables || [],
         snapshot.servers || [], snapshot.stockMonitor || [],
         snapshot.waitingTasks || [], snapshot.sessionAuditLogs || [],
         snapshot.idempotencyRecords || [], t.createdAt || now, now]
      );
    }
    report.inserted += 1;
  } else if (OVERWRITE && APPLY) {
    await tx.unsafe(
      `UPDATE stacklyra_tenants SET pra_config = $2::jsonb, restaurant_tables = $3::jsonb, servers = $4::jsonb,
         stock_monitor = $5::jsonb, waiting_tasks = $6::jsonb, updated_at = $7 WHERE id = $1`,
      [tenantId, snapshot.praConfig || {}, snapshot.restaurantTables || [],
       snapshot.servers || [], snapshot.stockMonitor || [],
       snapshot.waitingTasks || [], now]
    );
  }

  for (const spec of COLLECTIONS) {
    const docs = Array.isArray(snapshot[spec.field]) ? snapshot[spec.field] : [];
    for (const doc of docs) {
      const id = spec.idOf(doc);
      if (!id) { report.skipped += 1; continue; }
      const found = await tx.unsafe(
        `SELECT 1 FROM ${spec.table} WHERE tenant_id = $1 AND ${spec.idColumn} = $2`, [tenantId, id]);
      if (found.length > 0 && !OVERWRITE) { report.skipped += 1; continue; }

      const names = ["tenant_id", spec.idColumn, ...spec.cols.map((c) => c[0])];
      const casts = ["text", "text", ...spec.cols.map((c) => c[1])];
      const values = [tenantId, id, ...spec.cols.map((c) => c[2](doc))];
      if (spec.payload) {
        names.push("payload"); casts.push("jsonb");
        values.push({ ...doc, tenantId });
      }
      const updates = names.slice(2).map((n) => `${n} = EXCLUDED.${n}`).join(", ");
      if (APPLY) {
        await tx.unsafe(
          `INSERT INTO ${spec.table} (${names.join(", ")})
           VALUES (${values.map((_v, i) => `$${i + 1}::${casts[i]}`).join(", ")})
           ON CONFLICT (tenant_id, ${spec.idColumn}) DO ${updates ? `UPDATE SET ${updates}` : "NOTHING"}`,
          values
        );
      }
      if (found.length > 0) report.updated += 1; else report.inserted += 1;
    }
  }
  return report;
}

try {
  const tables = await sql.unsafe(`SELECT to_regclass('public.stacklyra_tenants') AS t`);
  if (!tables[0]?.t) {
    console.error("Schema not found. Start the app once against this DATABASE_URL, then re-run.");
    process.exit(1);
  }
  const sources = collectSources();
  if (sources.length === 0) {
    console.log("No legacy JSON files found under data/. Nothing to import.");
    process.exit(0);
  }
  console.log(`${APPLY ? "IMPORTING" : "DRY RUN (no writes)"}${OVERWRITE ? " with --overwrite" : ""}\n`);
  let failed = 0;
  for (const source of sources) {
    try {
      const report = await sql.begin((tx) => importTenant(tx, source));
      console.log(`${source.file} → ${source.tenantId}: ${report.inserted} new, ${report.updated} ${OVERWRITE ? "overwritten" : "existing"}, ${report.skipped} skipped`);
    } catch (err) {
      failed += 1;
      console.error(`${source.file} → ${source.tenantId}: FAILED — ${err.message}`);
    }
  }
  if (!APPLY) console.log("\nRe-run with --apply to write these rows.");
  process.exitCode = failed ? 1 : 0;
} finally {
  await sql.end({ timeout: 5 });
}
