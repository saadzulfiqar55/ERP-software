import { NextResponse } from "next/server";
import { appendAuditLog } from "@/core/audit";
import {
  assertActorPermission,
  resolveAuthenticatedTenantId,
} from "@/core/auth";
import { mapDataLayerError, withTransaction } from "@/core/db";
import {
  assertTenantFeature,
  SaaSEntitlementError,
} from "@/core/saas/entitlements";
import { sanitizeNoSqlPayload } from "@/core/validation";
import { ERPInvoice } from "@/lib/mock/erp-data";

export async function POST(request: Request) {
  try {
    const sessionTenantId = await resolveAuthenticatedTenantId();
    if (!sessionTenantId) {
      return NextResponse.json(
        { error: "Authentication required: Sign in with an active workspace profile." },
        { status: 401 }
      );
    }

    const rawBody = await request.json();
    const body = sanitizeNoSqlPayload(rawBody);
    const action = String(body.action || "");

    const { db } = await withTransaction(
      async (txDb) => {
        assertTenantFeature(txDb.tenant, "invoices", "Invoicing Module");
        const tenantId = txDb.tenant.id;
        const currentList: ERPInvoice[] = txDb.erpInvoices ?? [];

        if (action === "VOID" || action === "DELETE") {
          const actor = await assertActorPermission(txDb, "invoices:delete");
          const invoiceId = String(body.invoiceId || "");
          const target = currentList.find((i) => i.id === invoiceId);
          if (!target) {
            throw new Error("Invoice not found.");
          }

          if (action === "DELETE") {
            txDb.erpInvoices = currentList.filter((i) => i.id !== invoiceId);
            appendAuditLog(txDb, {
              tenantId,
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
              tenantId,
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
            tenantId,
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
      },
      ["INVOICES", "IMMUTABLE_AUDIT_LOGS"],
      sessionTenantId
    );

    return NextResponse.json({
      erpInvoices: db.erpInvoices || [],
    });
  } catch (err) {
    const dataLayer = mapDataLayerError(err);
    if (dataLayer) {
      return NextResponse.json(dataLayer.body, { status: dataLayer.status });
    }
    if (err instanceof SaaSEntitlementError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
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
