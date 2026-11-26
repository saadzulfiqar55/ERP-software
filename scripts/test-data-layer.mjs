#!/usr/bin/env node
/**
 * Data-layer integration tests (Phase 1 + Phase 2).
 *
 * Runs against a live app and inspects its database directly. USE A THROWAWAY DATABASE:
 * the suite creates workspaces, products, sales and ledger entries.
 *
 *   # terminal 1 — app pointed at a test database
 *   $env:DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:54329/postgres"; npx next dev -p 3100
 *   # terminal 2
 *   $env:TEST_DATABASE_URL = "postgres://postgres:postgres@127.0.0.1:54329/postgres"; node scripts/test-data-layer.mjs
 *
 * Env: TEST_BASE_URL (default http://localhost:3100), TEST_DATABASE_URL (required; must be
 * localhost unless --allow-remote is passed).
 */
import crypto from "node:crypto";
import postgres from "postgres";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3100";
const DB_URL = process.env.TEST_DATABASE_URL || "";
if (!DB_URL) {
  console.error("Set TEST_DATABASE_URL to the same throwaway database the app under test uses.");
  process.exit(2);
}
if (!/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(DB_URL) && !process.argv.includes("--allow-remote")) {
  console.error("TEST_DATABASE_URL is not on localhost. Refusing to write test data there (pass --allow-remote to override).");
  process.exit(2);
}

const db = postgres(DB_URL, { prepare: false, max: 2, ssl: false, onnotice: () => {} });

let pass = 0;
let fail = 0;
const check = (name, ok, extra = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};
const section = (title) => console.log(`\n# ${title}`);

async function call(path, { method = "POST", body, cookie, headers = {} } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, cookie: (res.headers.get("set-cookie") || "").split(";")[0] };
}

async function waitForApp() {
  for (let i = 0; i < 180; i++) {
    try {
      const r = await fetch(`${BASE}/api/saas/onboarding?checkSlug=zz`);
      if (r.status < 500) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`App not reachable at ${BASE}`);
}

async function registerWorkspace(prefix) {
  const slug = `${prefix}-${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
  const r = await call("/api/saas/onboarding", {
    body: {
      action: "REGISTER_WORKSPACE",
      organizationName: `${prefix} Co`,
      slug,
      ownerName: "Test Owner",
      ownerEmail: `owner@${slug}.test`,
      password: crypto.randomBytes(10).toString("hex"),
      planId: "growth",
    },
  });
  return { slug, tenantId: `ten-${slug}`, cookie: r.cookie, status: r.status };
}

const productFor = (stockQty) => ({
  id: `prod-${crypto.randomUUID()}`,
  code: "T-1",
  name: "Test Item",
  nameUrdu: "",
  segment: "RETAIL",
  category: "Test",
  kitchenStation: "NONE",
  taxMode: "EXCLUSIVE",
  stockQty,
  unit: "pcs",
  variants: [{ id: "v1", name: "Std", price: 100, costPrice: 60 }],
});

const saleBody = (product, key) => ({
  idempotencyKey: key || `sale-${crypto.randomUUID()}`,
  paymentMethod: "CASH",
  orderType: "TAKEAWAY",
  cashPaid: 200,
  items: [{
    cartItemId: crypto.randomUUID(), productId: product.id, code: product.code, name: product.name,
    nameUrdu: "", segment: "RETAIL", kitchenStation: "NONE", variantId: "v1", variantName: "Std",
    unitPrice: 100, quantity: 1, taxMode: "EXCLUSIVE",
  }],
});

await waitForApp();

// ---------------------------------------------------------------------------
section("Bootstrap and signup");
let r = await call("/api/state", { method: "GET" });
check("GET /api/state works", r.status === 200, `got ${r.status} ${r.json?.error || ""}`);
const flagship = await db`select 1 from stacklyra_tenants where id = 'ten-stacklyra'`;
check("flagship tenant exists", flagship.length === 1);

const raceSlug = `race-${Date.now().toString(36)}`;
const regs = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => call("/api/saas/onboarding", {
  body: { action: "REGISTER_WORKSPACE", organizationName: "Race Co", slug: raceSlug, ownerName: "Owner " + i, ownerEmail: `o${i}@${raceSlug}.test`, password: crypto.randomBytes(10).toString("hex"), planId: "growth" },
})));
check("concurrent signup of one slug: exactly one succeeds", regs.filter((x) => x.status === 201).length === 1, regs.map((x) => x.status).join(","));

// ---------------------------------------------------------------------------
section("Concurrency: stock, invoice numbers, lost writes");
const ws = await registerWorkspace("conc");
check("register workspace", ws.status === 201, `got ${ws.status}`);
const p5 = productFor(5);
r = await call("/api/state", { method: "PUT", cookie: ws.cookie, body: { newProduct: p5 } });
check("create product with 5 in stock", r.status === 200, `got ${r.status} ${r.json?.error || ""}`);
const sales = await Promise.all(Array.from({ length: 10 }, () => call("/api/orders", { cookie: ws.cookie, body: saleBody(p5) })));
const okSales = sales.filter((x) => x.status === 200);
check("10 concurrent sales of 5 units: exactly 5 succeed", okSales.length === 5, sales.map((x) => x.status).join(","));
check("rejected sales cite insufficient stock", sales.filter((x) => x.status !== 200).every((x) => /Insufficient stock/.test(x.json?.error || "")));
const invNos = okSales.map((x) => x.json?.order?.invoiceNumber);
check("invoice numbers distinct", new Set(invNos).size === 5, invNos.join(" "));
const [orderCount] = await db`select count(*)::int n from stacklyra_orders where tenant_id = ${ws.tenantId}`;
check("all 5 orders persisted", orderCount.n === 5, `found ${orderCount.n}`);
const [stockRow] = await db`select (payload->>'stockQty')::int q from stacklyra_products where tenant_id = ${ws.tenantId} and id = ${p5.id}`;
check("stock is exactly 0", stockRow?.q === 0, `stock ${stockRow?.q}`);

// ---------------------------------------------------------------------------
section("Idempotency (table-backed, survives > 200 sales)");
const bigProduct = productFor(1000);
r = await call("/api/state", { method: "PUT", cookie: ws.cookie, body: { newProduct: bigProduct } });
check("create product with 1000 in stock", r.status === 200, `got ${r.status} ${r.json?.error || ""}`);
const firstKey = `first-${crypto.randomUUID()}`;
r = await call("/api/orders", { cookie: ws.cookie, body: saleBody(bigProduct, firstKey) });
const firstInvoice = r.json?.order?.invoiceNumber;
check("first keyed sale", r.status === 200 && firstInvoice, `got ${r.status}`);
for (let batch = 0; batch < 21; batch++) {
  await Promise.all(Array.from({ length: 10 }, () => call("/api/orders", { cookie: ws.cookie, body: saleBody(bigProduct) })));
}
const [afterMany] = await db`select count(*)::int n from stacklyra_orders where tenant_id = ${ws.tenantId}`;
check("216 orders recorded", afterMany.n === 216, `found ${afterMany.n}`);
const replays = await Promise.all(Array.from({ length: 5 }, () => call("/api/orders", { cookie: ws.cookie, body: saleBody(bigProduct, firstKey) })));
check("replaying the first key after 210 newer sales returns the original invoice",
  replays.every((x) => x.status === 200 && x.json?.order?.invoiceNumber === firstInvoice),
  [...new Set(replays.map((x) => x.json?.order?.invoiceNumber))].join(" "));
const [afterReplay] = await db`select count(*)::int n from stacklyra_orders where tenant_id = ${ws.tenantId}`;
check("replays created no new orders", afterReplay.n === 216, `found ${afterReplay.n}`);

// ---------------------------------------------------------------------------
section("Reads: recent slice, paging, summary, export");
r = await call("/api/state", { method: "GET", cookie: ws.cookie });
check("/api/state returns only the newest 50 orders", r.json?.orders?.length === 50, `got ${r.json?.orders?.length}`);
const seen = new Set();
let cursor = null;
let pages = 0;
let sumMinor = 0;
do {
  const page = await call(`/api/orders?limit=40${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { method: "GET", cookie: ws.cookie });
  if (page.status !== 200) { check("orders page", false, `got ${page.status} ${page.json?.error || ""}`); break; }
  for (const o of page.json.items) {
    seen.add(o.id);
    sumMinor += Math.round(o.taxBreakdown.grandTotal * 100);
  }
  cursor = page.json.nextCursor;
  pages++;
} while (cursor && pages < 50);
check("paging through all orders: no gaps or duplicates", seen.size === 216 && pages === 6, `${seen.size} unique over ${pages} pages`);
const year = new Date().getFullYear();
r = await call(`/api/summary?year=${year}&tz=Asia/Karachi`, { method: "GET", cookie: ws.cookie });
check("summary order count matches", r.json?.orders?.count === 216, `got ${r.json?.orders?.count}`);
check("summary revenue equals sum of all orders", r.json?.orders?.revenueMinor === sumMinor, `${r.json?.orders?.revenueMinor} vs ${sumMinor}`);
check("summary monthly revenue adds up to this year's total",
  (r.json?.orders?.monthlyRevenueMinor || []).reduce((a, b) => a + b, 0) === sumMinor);
r = await call("/api/orders?limit=5&q=" + encodeURIComponent(firstInvoice), { method: "GET", cookie: ws.cookie });
check("order search finds an old invoice by number", r.json?.items?.some((o) => o.invoiceNumber === firstInvoice), `got ${r.json?.items?.length}`);
r = await call("/api/orders/export", { method: "GET", cookie: ws.cookie });
const csvLines = r.text.trim().split("\n");
check("CSV export contains every order", r.status === 200 && csvLines.length === 217, `${csvLines.length - 1} rows`);
r = await call("/api/orders", { method: "GET" });
check("paged endpoints require sign-in", r.status === 401, `got ${r.status}`);

// ---------------------------------------------------------------------------
section("Ledger: reversal-only, corrections, immutability");
r = await call("/api/ledger", { cookie: ws.cookie, body: { action: "CREATE_PARTY", name: "Test Customer", type: "CUSTOMER" } });
const partyId = r.json?.party?.id || r.json?.result?.party?.id || (r.json?.db?.parties || []).find((p) => p.name === "Test Customer")?.id;
check("create party", r.status === 200 && partyId, `got ${r.status} ${r.json?.error || ""}`);
r = await call("/api/ledger", { cookie: ws.cookie, body: { partyId, debit: 500, credit: 0, description: "Test bill", paymentMode: "CASH", idempotencyKey: crypto.randomUUID() } });
const entry = (r.json?.db?.ledger || []).find((e) => e.description === "Test bill");
check("post a voucher", r.status === 200 && entry, `got ${r.status} ${r.json?.error || ""}`);
r = await call("/api/ledger", { cookie: ws.cookie, body: { action: "DELETE_ENTRY", entryId: entry.id } });
check("DELETE_ENTRY answers with a reversal", r.status === 200 && r.json?.reversal?.voucherNo?.startsWith("REV"), `got ${r.status} ${r.json?.error || ""}`);
const ledgerRows = await db`select payload from stacklyra_ledger_entries where tenant_id = ${ws.tenantId} and party_id = ${partyId}`;
const original = ledgerRows.map((x) => x.payload).find((p) => p.id === entry.id);
check("original entry still exists, marked reversed", original?.isReversed === true && original?.reversedByVoucherNo, JSON.stringify({ isReversed: original?.isReversed }));
check("a reversal entry was added", ledgerRows.length === 2);
const [party] = await db`select (payload->>'currentBalance')::numeric b from stacklyra_parties where tenant_id = ${ws.tenantId} and id = ${partyId}`;
check("party balance back to 0", Number(party?.b) === 0, `balance ${party?.b}`);
r = await call("/api/ledger", { cookie: ws.cookie, body: { action: "REVERSE_ENTRY", entryId: entry.id } });
check("reversing twice is refused", r.status === 400 && /already reversed/.test(r.json?.error || ""), `got ${r.status} ${r.json?.error || ""}`);
const reversalId = ledgerRows.map((x) => x.payload).find((p) => p.id !== entry.id)?.id;
r = await call("/api/ledger", { cookie: ws.cookie, body: { action: "REVERSE_ENTRY", entryId: reversalId } });
check("reversing a reversal is refused", r.status === 400 && /itself a reversal/.test(r.json?.error || ""), `got ${r.status} ${r.json?.error || ""}`);

r = await call("/api/ledger", { cookie: ws.cookie, body: { partyId, debit: 300, credit: 0, description: "Wrong amount", paymentMode: "CASH", idempotencyKey: crypto.randomUUID() } });
const wrong = (r.json?.db?.ledger || []).find((e) => e.description === "Wrong amount");
r = await call("/api/ledger", { cookie: ws.cookie, body: { action: "EDIT_ENTRY", entryId: wrong.id, debit: 350, credit: 0, description: "Right amount" } });
check("EDIT_ENTRY posts reversal + corrected voucher", r.status === 200 && r.json?.reversal && r.json?.corrected?.debit === 350, `got ${r.status} ${r.json?.error || ""}`);
const [party2] = await db`select (payload->>'currentBalance')::numeric b from stacklyra_parties where tenant_id = ${ws.tenantId} and id = ${partyId}`;
check("balance reflects only the corrected amount", Number(party2?.b) === 350, `balance ${party2?.b}`);

const [partyRow] = await db`select payload from stacklyra_parties where tenant_id = ${ws.tenantId} and id = ${partyId}`;
r = await call("/api/ledger", { cookie: ws.cookie, body: { action: "EDIT_PARTY", party: { ...partyRow.payload, name: "Renamed Customer" } } });
const stillOldName = await db`select count(*)::int n from stacklyra_ledger_entries where tenant_id = ${ws.tenantId} and payload->>'partyName' = 'Test Customer'`;
check("renaming a party does not rewrite ledger history", r.status === 200 && stillOldName[0].n >= 4, `got ${r.status} ${r.json?.error || ""}, old-name rows ${stillOldName[0].n}`);

let blocked = null;
try { await db`update stacklyra_ledger_entries set payload = payload || '{"debit": 1}'::jsonb where tenant_id = ${ws.tenantId} and id = ${entry.id}`; } catch (e) { blocked = e; }
check("database rejects editing a ledger amount", blocked?.code === "SL001", blocked?.code || "no error");
blocked = null;
try { await db`delete from stacklyra_ledger_entries where tenant_id = ${ws.tenantId} and id = ${entry.id}`; } catch (e) { blocked = e; }
check("database rejects deleting a ledger entry", blocked?.code === "SL001", blocked?.code || "no error");
blocked = null;
try { await db`delete from stacklyra_immutable_audit_logs where tenant_id = ${ws.tenantId}`; } catch (e) { blocked = e; }
check("database rejects deleting audit logs", blocked?.code === "SL001", blocked?.code || "no error");
const [auditCount] = await db`select count(*)::int n from stacklyra_immutable_audit_logs where tenant_id = ${ws.tenantId}`;
check("audit log kept beyond the old 300 cap", auditCount.n > 300, `${auditCount.n} entries`);

r = await call("/api/ledger?partyId=" + encodeURIComponent(partyId), { method: "GET", cookie: ws.cookie });
check("ledger page filtered by party", r.status === 200 && r.json.items.length === 5 && r.json.items.every((e) => e.partyId === partyId), `got ${r.status} ${r.json?.items?.length}`);

// ---------------------------------------------------------------------------
section("Invoices: only drafts can be deleted");
const mkInvoice = (status) => ({
  id: `inv-${crypto.randomUUID()}`, invoiceNumber: `T-${Math.floor(Math.random() * 1e6)}`, customerId: "c1",
  customerName: "Inv Customer", customerInitials: "IC", customerEmail: "c@x.test", issuedDate: "2026-01-01",
  dueDate: "2026-01-31", paymentTerms: "NET_30", currency: "PKR", status, discountPercent: 0, amountMinor: 10000,
  paymentMethodsAllowed: [], settings: { paymentReminders: false, attachPdfCopy: false }, lineItems: [],
});
const sent = mkInvoice("SENT");
const draft = mkInvoice("DRAFT");
await call("/api/invoices", { cookie: ws.cookie, body: { action: "CREATE", invoice: sent } });
await call("/api/invoices", { cookie: ws.cookie, body: { action: "CREATE", invoice: draft } });
r = await call("/api/invoices", { cookie: ws.cookie, body: { action: "DELETE", invoiceId: sent.id } });
check("deleting a sent invoice is refused", r.status === 400 && /Void it instead/.test(r.json?.error || ""), `got ${r.status} ${r.json?.error || ""}`);
r = await call("/api/invoices", { cookie: ws.cookie, body: { action: "DELETE", invoiceId: draft.id } });
check("deleting a draft works", r.status === 200, `got ${r.status} ${r.json?.error || ""}`);

// ---------------------------------------------------------------------------
section("Permissions and isolation");
r = await call("/api/users", { cookie: ws.cookie, body: { action: "CREATE", name: "Test Cashier", role: "CASHIER", pin: "4821" } });
const cashierId = r.json?.user?.id;
r = await call("/api/auth", { body: { tenantSlug: ws.slug, userId: cashierId, pin: "4821" } });
const cashier = r.cookie;
check("cashier signs in", r.status === 200, `got ${r.status}`);
r = await call("/api/ledger", { method: "GET", cookie: cashier });
check("cashier cannot page the ledger", r.status === 403, `got ${r.status}`);
r = await call("/api/audit", { method: "GET", cookie: cashier });
check("cashier cannot page the audit log", r.status === 403, `got ${r.status}`);
r = await call("/api/summary", { method: "GET", cookie: cashier });
check("cashier summary hides ledger and audit counts", r.status === 200 && r.json.ledgerCount === 0 && r.json.auditCount === 0);
const other = await registerWorkspace("iso");
r = await call("/api/orders", { method: "GET", cookie: other.cookie });
check("another tenant sees none of these orders", r.status === 200 && r.json.items.length === 0, `got ${r.json?.items?.length}`);

console.log(`\n${pass} passed, ${fail} failed`);
await db.end();
process.exit(fail ? 1 : 0);
