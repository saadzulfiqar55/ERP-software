import { NextResponse } from "next/server";
import { appendAuditLog } from "@/core/audit";
import { assertActorPermission } from "@/core/auth";
import { withTransaction } from "@/core/db";
import { sanitizeNoSqlPayload } from "@/core/validation";
import { ERPInvoice, INITIAL_ERP_INVOICES } from "@/lib/mock/erp-data";

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const body = sanitizeNoSqlPayload(rawBody);
    const action = String(body.action || "");

    const { db } = await withTransaction(async (txDb) => {
      const currentList: ERPInvoice[] =
        txDb.erpInvoices && txDb.erpInvoices.length > 0
          ? txDb.erpInvoices
          : [...INITIAL_ERP_INVOICES];

      if (action === "VOID" || action === "DELETE") {
        // Strictly Owner / Super Admin ONLY
        const actor = await assertActorPermission(txDb, "invoices:delete");
        const invoiceId = String(body.invoiceId || "");
        const target = currentList.find((i) => i.id === invoiceId);
        if (!target) {
          throw new Error("Invoice not found.");
        }

        if (action === "DELETE") {
          txDb.erpInvoices = currentList.filter((i) => i.id !== invoiceId);
          appendAuditLog(txDb, {
            actorId: actor.id,
            actorName: actor.name,
            actorRole: actor.role,
            module: "ACCOUNTING",
            action: "REVERSE_VOID",
            entityType: "ERPInvoice",
            entityId: invoiceId,
            summary: `Super Admin deleted invoice ${target.invoiceNumber} (${target.customerName}).`,
          });
        } else {
          txDb.erpInvoices = currentList.map((i) =>
            i.id === invoiceId ? { ...i, status: "CANCELLED" } : i
          );
          appendAuditLog(txDb, {
            actorId: actor.id,
            actorName: actor.name,
            actorRole: actor.role,
            module: "ACCOUNTING",
            action: "REVERSE_VOID",
            entityType: "ERPInvoice",
            entityId: invoiceId,
            summary: `Super Admin voided invoice ${target.invoiceNumber}.`,
          });
        }
        return true;
      }

      const actor = await assertActorPermission(txDb, "pos:sale:create");

      if (action === "CREATE") {
        const inv = body.invoice as ERPInvoice;
        txDb.erpInvoices = [inv, ...currentList];
        appendAuditLog(txDb, {
          actorId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
          module: "POS",
          action: "CREATE",
          entityType: "ERPInvoice",
          entityId: inv.id,
          summary: `Created invoice ${inv.invoiceNumber} for ${inv.customerName} (${inv.status}).`,
        });
      } else if (action === "MARK_PAID") {
        const invoiceId = String(body.invoiceId || "");
        txDb.erpInvoices = currentList.map((i) =>
          i.id === invoiceId ? { ...i, status: "PAID" } : i
        );
      } else if (action === "BULK_MARK_SENT") {
        const ids = (body.invoiceIds as string[]) || [];
        txDb.erpInvoices = currentList.map((i) =>
          ids.includes(i.id) ? { ...i, status: "SENT" } : i
        );
      } else if (action === "DUPLICATE") {
        const dup = body.invoice as ERPInvoice;
        txDb.erpInvoices = [dup, ...currentList];
      } else {
        throw new Error(`Unsupported invoice action: ${action}`);
      }

      return true;
    }, ["INVOICES", "IMMUTABLE_AUDIT_LOGS"]);

    return NextResponse.json({
      erpInvoices: db.erpInvoices || [],
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update invoices";
    const status = message.includes("Access Denied")
      ? 403
      : message.includes("Authentication required")
      ? 401
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
