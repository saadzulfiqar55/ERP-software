import { NextResponse } from "next/server";
import { appendAuditLog, DEFAULT_BRANCH_ID, DEFAULT_TENANT_ID } from "@/core/audit";
import { assertActorPermission } from "@/core/auth";
import { withTransaction } from "@/core/db";
import { lookupIdempotencyRecord, storeIdempotencyRecord } from "@/core/idempotency";
import { toMinorUnits } from "@/core/money";
import { sanitizeNoSqlPayload } from "@/core/validation";
import { PartyAccount } from "@/lib/types";
import { AccountingService } from "@/modules/accounting/accounting.service";
import { InventoryService } from "@/modules/inventory/inventory.service";

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const body = sanitizeNoSqlPayload(rawBody);
    const idempotencyKey = body.idempotencyKey as string | undefined;

    const { result, db } = await withTransaction(async (txDb) => {
      const cached = lookupIdempotencyRecord(txDb, idempotencyKey, "LEDGER_MUTATION");
      if (cached) {
        return cached.responseBody;
      }

      // Strictly Owner / Super Admin ONLY for all Ledger / Khata operations
      const actor = await assertActorPermission(txDb, "accounting:ledger:view");

      // 1. Toggle Fiscal Period Lock (`accounting:period:close`)
      if (body.action === "TOGGLE_FISCAL_PERIOD") {
        await assertActorPermission(txDb, "accounting:period:close");
        const targetKey = body.periodKey as string;
        txDb.fiscalPeriods = (txDb.fiscalPeriods || []).map((fp) =>
          fp.periodKey === targetKey
            ? {
                ...fp,
                isLocked: !fp.isLocked,
                lockedAt: !fp.isLocked ? new Date().toISOString() : undefined,
                lockedBy: !fp.isLocked ? `${actor.name} (${actor.role})` : undefined,
              }
            : fp
        );
        appendAuditLog(txDb, {
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

      // 2. Create a new Party Account
      if (body.action === "CREATE_PARTY") {
        const openingPkr = Number(body.openingBalance) || 0;
        const newParty: PartyAccount = {
          id: `party-${Date.now()}`,
          tenantId: DEFAULT_TENANT_ID,
          branchId: DEFAULT_BRANCH_ID,
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
                currentBalanceMinor: toMinorUnits(updatedParty.currentBalance),
              }
            : p
        );
        txDb.ledger = txDb.ledger.map((entry) =>
          entry.partyId === updatedParty.id
            ? { ...entry, partyName: updatedParty.name, partyType: updatedParty.type }
            : entry
        );
        appendAuditLog(txDb, {
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

      // 5. Edit an existing Ledger Voucher Entry (with Fiscal Period Lock check + Audit Log)
      if (body.action === "EDIT_ENTRY") {
        const { entryId, description, debit, credit, voucherNo } = body as {
          entryId: string;
          description: string;
          debit: number;
          credit: number;
          voucherNo?: string;
        };
        const entryIdx = txDb.ledger.findIndex((e) => e.id === entryId);
        if (entryIdx === -1) {
          throw new Error("Ledger entry not found");
        }

        const oldEntry = txDb.ledger[entryIdx];
        AccountingService.assertFiscalPeriodOpen(txDb, oldEntry.createdAt);

        const oldImpact = oldEntry.debit - oldEntry.credit;
        const newDebit = Number(debit) || 0;
        const newCredit = Number(credit) || 0;
        const newImpact = newDebit - newCredit;
        const deltaImpact = newImpact - oldImpact;

        const pIdx = txDb.parties.findIndex((p) => p.id === oldEntry.partyId);
        if (pIdx !== -1) {
          const nextBal = txDb.parties[pIdx].currentBalance + deltaImpact;
          txDb.parties[pIdx] = {
            ...txDb.parties[pIdx],
            currentBalance: nextBal,
            currentBalanceMinor: toMinorUnits(nextBal),
          };
        }

        txDb.ledger[entryIdx] = {
          ...oldEntry,
          voucherNo: voucherNo || oldEntry.voucherNo,
          description: description || oldEntry.description,
          debit: newDebit,
          credit: newCredit,
          debitMinor: toMinorUnits(newDebit),
          creditMinor: toMinorUnits(newCredit),
          balanceAfter: oldEntry.balanceAfter + deltaImpact,
          balanceAfterMinor: toMinorUnits(oldEntry.balanceAfter + deltaImpact),
        };

        appendAuditLog(txDb, {
          actorId: actor.id,
          actorName: actor.name,
          actorRole: actor.role,
          module: "ACCOUNTING",
          action: "UPDATE",
          entityType: "LedgerVoucher",
          entityId: entryId,
          summary: `Adjusted voucher ${txDb.ledger[entryIdx].voucherNo} (Debit: ${newDebit}, Credit: ${newCredit}).`,
        });

        return { entry: txDb.ledger[entryIdx] };
      }

      // 6. Reverse / Credit-Note or Void a Ledger Entry
      if (body.action === "REVERSE_ENTRY") {
        await assertActorPermission(txDb, "accounting:journal:reverse");
        AccountingService.reverseOrVoidEntry(txDb, body.entryId as string, actor, false);
        return { reversed: true };
      }

      if (body.action === "DELETE_ENTRY") {
        await assertActorPermission(txDb, "accounting:journal:reverse");
        AccountingService.reverseOrVoidEntry(txDb, body.entryId as string, actor, true);
        return { voided: true };
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
      storeIdempotencyRecord(txDb, idempotencyKey, "LEDGER_MUTATION", 200, resPayload);
      return resPayload;
    });

    return NextResponse.json({
      ...((result as object) || {}),
      db: {
        ...db,
        products: InventoryService.listActiveProducts(db),
        parties: AccountingService.listActiveParties(db),
      },
    });
  } catch (err) {
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
