import { NextResponse } from "next/server";
import { readErrorResponse, requireRequestActor } from "@/core/auth/request-actor";
import { readJournalPage } from "@/lib/db";
import { appendAuditLog, DEFAULT_BRANCH_ID } from "@/core/audit";
import {
  assertActorPermission,
  resolveAuthenticatedTenantId,
} from "@/core/auth";
import { buildScopedStateResponse } from "@/core/auth/state-scoper";
import { mapDataLayerError, withTransaction } from "@/core/db";
import {
  lookupIdempotencyRecord,
  storeIdempotencyRecord,
} from "@/core/idempotency";
import { toMinorUnits } from "@/core/money";
import {
  assertTenantFeature,
  SaaSEntitlementError,
} from "@/core/saas/entitlements";
import { sanitizeNoSqlPayload } from "@/core/validation";
import { PartyAccount, UserProfile } from "@/lib/types";
import { AccountingService } from "@/modules/accounting/accounting.service";

/**
 * GET /api/ledger?cursor=&limit=&partyId=
 * Pages through ledger entries, newest first, optionally for one party.
 */
export async function GET(request: Request) {
  try {
    const { tenant } = await requireRequestActor("accounting:ledger:view");
    const url = new URL(request.url);
    const page = await readJournalPage(tenant.id, "ledger", {
      cursor: url.searchParams.get("cursor"),
      limit: Number(url.searchParams.get("limit")) || 100,
      partyId: url.searchParams.get("partyId") || undefined,
    });
    return NextResponse.json(page);
  } catch (err) {
    return readErrorResponse(err);
  }
}

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
    const idempotencyKey = body.idempotencyKey as string | undefined;

    let actorRef: UserProfile | null = null;

    const { result, db } = await withTransaction(
      async (txDb, ctx) => {
        const actor = await assertActorPermission(txDb, "accounting:ledger:view");
        actorRef = actor;
        const tenantId = txDb.tenant.id;

        const cached = await lookupIdempotencyRecord(
          ctx,
          idempotencyKey,
          `LEDGER_MUTATION:${tenantId}`
        );
        if (cached) {
          return cached.responseBody;
        }

        // 1. Toggle Fiscal Period Lock (`accounting:period:close`)
        if (body.action === "TOGGLE_FISCAL_PERIOD") {
          await assertActorPermission(txDb, "accounting:period:close");
          assertTenantFeature(
            txDb.tenant,
            "fiscal_period_locks",
            "Fiscal Period Locking"
          );
          const targetKey = body.periodKey as string;
          txDb.fiscalPeriods = (txDb.fiscalPeriods || []).map((fp) =>
            fp.periodKey === targetKey
              ? {
                  ...fp,
                  tenantId,
                  isLocked: !fp.isLocked,
                  lockedAt: !fp.isLocked ? new Date().toISOString() : undefined,
                  lockedBy: !fp.isLocked
                    ? `${actor.name} (${actor.role})`
                    : undefined,
                }
              : fp
          );
          appendAuditLog(txDb, {
            tenantId,
            actorId: actor.id,
            actorName: actor.name,
            actorRole: actor.role,
            module: "ACCOUNTING",
            action: "PERIOD_LOCK",
            entityType: "FiscalPeriod",
            entityId: targetKey,
            summary: `Toggled fiscal period lock for ${targetKey}.`,
          });
          return { action: "TOGGLE_FISCAL_PERIOD" };
        }

        assertTenantFeature(
          txDb.tenant,
          "khata_ledger",
          "Double-Entry Accounting & Khata Ledger"
        );

        // 2. Create a new Party Account
        if (body.action === "CREATE_PARTY") {
          const openingPkr = Number(body.openingBalance) || 0;
          const newParty: PartyAccount = {
            id: `party-${Date.now()}`,
            tenantId,
            branchId: actor.branchId || DEFAULT_BRANCH_ID,
            name: body.name,
            nameUrdu: "",
            type: body.type,
            phone: body.phone || "-",
            ntnOrCnic: body.ntnOrCnic || "",
            creditLimit: Number(body.creditLimit) || 50000,
            currentBalance: openingPkr,
            currentBalanceMinor: toMinorUnits(openingPkr),
            notes: body.notes || "",
            isArchived: false,
          };
          txDb.parties = [newParty, ...txDb.parties];
          appendAuditLog(txDb, {
            tenantId,
            actorId: actor.id,
            actorName: actor.name,
            actorRole: actor.role,
            module: "ACCOUNTING",
            action: "CREATE",
            entityType: "PartyAccount",
            entityId: newParty.id,
            summary: `Opened Khata account "${newParty.name}" (${newParty.type}).`,
          });
          return { party: newParty };
        }

        // 3. Edit an existing Party Account
        if (body.action === "EDIT_PARTY") {
          const updatedParty = body.party as PartyAccount;
          txDb.parties = txDb.parties.map((p) =>
            p.id === updatedParty.id
              ? {
                  ...p,
                  ...updatedParty,
                  tenantId,
                  currentBalanceMinor: toMinorUnits(updatedParty.currentBalance),
                }
              : p
          );
          // Ledger entries keep the party name they were posted with (history is immutable);
          // screens show the current name from the party record.
          appendAuditLog(txDb, {
            tenantId,
            actorId: actor.id,
            actorName: actor.name,
            actorRole: actor.role,
            module: "ACCOUNTING",
            action: "UPDATE",
            entityType: "PartyAccount",
            entityId: updatedParty.id,
            summary: `Updated Khata account "${updatedParty.name}".`,
          });
          return { party: updatedParty };
        }

        // 4. Soft-Archive Party Account (`isArchived: true`)
        if (body.action === "DELETE_PARTY") {
          await assertActorPermission(txDb, "accounting:journal:reverse");
          const targetPartyId = body.partyId as string;
          AccountingService.archivePartySoft(txDb, targetPartyId, actor);
          return { archivedPartyId: targetPartyId };
        }

        // 5. Correct a posted voucher: reversal + new corrected voucher (never edited in place)
        if (body.action === "EDIT_ENTRY") {
          await assertActorPermission(txDb, "accounting:journal:reverse");
          await assertActorPermission(txDb, "accounting:journal:post");
          const { entryId, description, debit, credit } = body as {
            entryId: string;
            description: string;
            debit: number;
            credit: number;
          };
          await ctx.loadLedgerEntries([String(entryId || "")]);
          const { reversal, corrected } = AccountingService.correctEntry(
            txDb,
            String(entryId || ""),
            {
              debitPkr: Number(debit) || 0,
              creditPkr: Number(credit) || 0,
              description: typeof description === "string" ? description : undefined,
            },
            actor
          );
          return { entry: corrected, reversal, corrected };
        }

        // 6. Reverse a voucher. DELETE_ENTRY is kept for older clients and now also reverses:
        //    posted entries are never removed.
        if (body.action === "REVERSE_ENTRY" || body.action === "DELETE_ENTRY") {
          await assertActorPermission(txDb, "accounting:journal:reverse");
          const entryId = String(body.entryId || "");
          await ctx.loadLedgerEntries([entryId]);
          const reversal = AccountingService.reverseEntry(
            txDb,
            entryId,
            actor,
            body.action === "DELETE_ENTRY" ? "voided" : undefined
          );
          return { reversed: true, voided: body.action === "DELETE_ENTRY", reversal };
        }

        // 7. Default: Post Balanced Double-Entry Voucher
        await assertActorPermission(txDb, "accounting:journal:post");
        const entry = AccountingService.postVoucher(
          txDb,
          {
            partyId: body.partyId,
            debitPkr: Number(body.debit) || 0,
            creditPkr: Number(body.credit) || 0,
            description: body.description || "Ledger Voucher",
            paymentMode: body.paymentMode || "CASH",
            customVoucherNo: body.voucherNo,
          },
          actor
        );

        const resPayload = { entry };
        await storeIdempotencyRecord(
          ctx,
          idempotencyKey,
          `LEDGER_MUTATION:${tenantId}`,
          200,
          resPayload
        );
        return resPayload;
      },
      ["PARTIES", "LEDGER", "FISCAL_PERIODS", "IMMUTABLE_AUDIT_LOGS"],
      sessionTenantId
    );

    return NextResponse.json({
      ...((result as object) || {}),
      db: buildScopedStateResponse(db, actorRef),
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
      err instanceof Error ? err.message : "Failed to process ledger action";
    const status = message.includes("Access Denied")
      ? 403
      : message.includes("Authentication required")
      ? 401
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
