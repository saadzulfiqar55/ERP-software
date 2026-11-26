import { appendAuditLog, DEFAULT_BRANCH_ID } from "@/core/audit";
import { nextSequentialNumber } from "@/core/db";
import {
  assertBalancedJournal,
  fromMinorUnits,
  subtractMinor,
  toMinorUnits,
} from "@/core/money";
import { assertTenantFeature } from "@/core/saas/entitlements";
import { DatabaseSchema } from "@/lib/db";
import {
  DoubleEntryLine,
  LedgerEntry,
  PartyAccount,
  UserProfile,
} from "@/lib/types";

export const AccountingService = {
  /**
   * Enforces Tenant-Isolated Fiscal Period Locking
   */
  assertFiscalPeriodOpen(txDb: DatabaseSchema, isoDate: string): void {
    const periodKey = isoDate.slice(0, 7); // "YYYY-MM"
    const period = (txDb.fiscalPeriods || []).find(
      (fp) => fp.periodKey === periodKey
    );
    if (period && period.isLocked) {
      throw new Error(
        `Fiscal Period Locked: Cannot post or mutate transactions in closed period "${period.label}".`
      );
    }
  },

  /**
   * Posts a Balanced Double-Entry Voucher using Integer Minor-Unit (Paisa) Arithmetic
   */
  postVoucher(
    txDb: DatabaseSchema,
    params: {
      partyId: string;
      debitPkr: number;
      creditPkr: number;
      description: string;
      paymentMode: LedgerEntry["paymentMode"];
      customVoucherNo?: string;
      relatedOrderId?: string;
    },
    actor: UserProfile
  ): LedgerEntry {
    assertTenantFeature(
      txDb.tenant,
      "khata_ledger",
      "Double-Entry Accounting & Khata Ledger"
    );

    const tenantId = txDb.tenant.id;
    const nowIso = new Date().toISOString();
    this.assertFiscalPeriodOpen(txDb, nowIso);

    const partyIndex = txDb.parties.findIndex(
      (p) => p.id === params.partyId && !p.isArchived
    );
    if (partyIndex === -1) {
      throw new Error("Party Khata account not found or archived.");
    }

    const party = txDb.parties[partyIndex];
    const debitMinor = toMinorUnits(params.debitPkr);
    const creditMinor = toMinorUnits(params.creditPkr);
    const netDeltaMinor = subtractMinor(debitMinor, creditMinor);

    const journalLines: DoubleEntryLine[] =
      debitMinor > 0
        ? [
            {
              accountCode: `PARTY:${party.id}`,
              accountName: party.name,
              debitMinor,
              creditMinor: 0,
            },
            {
              accountCode: "1010-CASH-BANK",
              accountName: `Cash / ${params.paymentMode} Clearing`,
              debitMinor: 0,
              creditMinor: debitMinor,
            },
          ]
        : [
            {
              accountCode: "1010-CASH-BANK",
              accountName: `Cash / ${params.paymentMode} Clearing`,
              debitMinor: creditMinor,
              creditMinor: 0,
            },
            {
              accountCode: `PARTY:${party.id}`,
              accountName: party.name,
              debitMinor: 0,
              creditMinor: creditMinor,
            },
          ];

    assertBalancedJournal(journalLines);

    const prevBalanceMinor =
      party.currentBalanceMinor !== undefined
        ? party.currentBalanceMinor
        : toMinorUnits(party.currentBalance);
    const nextBalanceMinor = prevBalanceMinor + netDeltaMinor;
    const nextBalancePkr = fromMinorUnits(nextBalanceMinor);

    txDb.parties[partyIndex] = {
      ...party,
      tenantId,
      currentBalance: nextBalancePkr,
      currentBalanceMinor: nextBalanceMinor,
    };

    const voucherNo =
      params.customVoucherNo ||
      nextSequentialNumber(txDb, "VOUCHER", "VCH", new Date().getFullYear());

    const entry: LedgerEntry = {
      id: `led-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      tenantId,
      branchId: actor.branchId || DEFAULT_BRANCH_ID,
      createdAt: nowIso,
      partyId: party.id,
      partyName: party.name,
      partyType: party.type,
      voucherNo,
      description: params.description,
      paymentMode: params.paymentMode,
      debit: fromMinorUnits(debitMinor),
      credit: fromMinorUnits(creditMinor),
      balanceAfter: nextBalancePkr,
      debitMinor,
      creditMinor,
      balanceAfterMinor: nextBalanceMinor,
      journalLines,
      relatedOrderId: params.relatedOrderId,
      isImmutable: true,
    };

    txDb.ledger = [entry, ...txDb.ledger];

    appendAuditLog(txDb, {
      tenantId,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      module: "ACCOUNTING",
      action: "CREATE",
      entityType: "LedgerVoucher",
      entityId: entry.id,
      summary: `Posted balanced journal ${voucherNo} for "${party.name}" (Debit PKR ${entry.debit}, Credit PKR ${entry.credit}).`,
    });

    return entry;
  },

  /**
   * Append-only reversal: posts an equal and opposite voucher and marks the original as
   * reversed. Posted entries are never deleted or edited (enforced by a database trigger).
   * The original must already be in `txDb.ledger` (load it with ctx.loadLedgerEntries).
   */
  reverseEntry(
    txDb: DatabaseSchema,
    entryId: string,
    actor: UserProfile,
    reason?: string
  ): LedgerEntry {
    assertTenantFeature(
      txDb.tenant,
      "khata_ledger",
      "Double-Entry Accounting & Khata Ledger"
    );

    const targetIdx = txDb.ledger.findIndex((e) => e.id === entryId);
    if (targetIdx === -1) {
      throw new Error("Ledger entry not found.");
    }
    const original = txDb.ledger[targetIdx];
    if (original.isReversed) {
      throw new Error(
        `Voucher ${original.voucherNo} is already reversed${
          original.reversedByVoucherNo ? ` by ${original.reversedByVoucherNo}` : ""
        }.`
      );
    }
    if (original.paymentMode === "REVERSAL_NOTE" || original.reversesEntryId) {
      throw new Error(
        `Voucher ${original.voucherNo} is itself a reversal and cannot be reversed. Post a new voucher instead.`
      );
    }
    this.assertFiscalPeriodOpen(txDb, original.createdAt);

    const revVoucherNo = nextSequentialNumber(
      txDb,
      "REVERSAL",
      "REV",
      new Date().getFullYear()
    );

    const reversal = this.postVoucher(
      txDb,
      {
        partyId: original.partyId,
        debitPkr: original.credit,
        creditPkr: original.debit,
        description: `REVERSAL of ${original.voucherNo}${reason ? ` (${reason})` : ""}: ${original.description}`,
        paymentMode: "REVERSAL_NOTE",
        customVoucherNo: revVoucherNo,
      },
      actor
    );
    txDb.ledger = txDb.ledger.map((e) =>
      e.id === reversal.id ? { ...e, isReversal: true, reversesEntryId: original.id } : e
    );

    txDb.ledger = txDb.ledger.map((e) =>
      e.id === original.id
        ? {
            ...e,
            isReversed: true,
            reversedByEntryId: reversal.id,
            reversedByVoucherNo: revVoucherNo,
            reversedAt: reversal.createdAt,
          }
        : e
    );

    appendAuditLog(txDb, {
      tenantId: txDb.tenant.id,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      module: "ACCOUNTING",
      action: "REVERSE_VOID",
      entityType: "LedgerVoucher",
      entityId: original.id,
      summary: `Reversed voucher ${original.voucherNo} for "${original.partyName}" with ${revVoucherNo}${reason ? ` (${reason})` : ""}.`,
    });

    return { ...reversal, isReversal: true, reversesEntryId: original.id };
  },

  /**
   * Correcting a posted voucher = reverse it, then post a new voucher with the corrected
   * amounts. Both stay in the ledger, so the history and running balances remain correct.
   */
  correctEntry(
    txDb: DatabaseSchema,
    entryId: string,
    correction: { debitPkr: number; creditPkr: number; description?: string },
    actor: UserProfile
  ): { reversal: LedgerEntry; corrected: LedgerEntry } {
    const original = txDb.ledger.find((e) => e.id === entryId);
    if (!original) {
      throw new Error("Ledger entry not found.");
    }
    const reversal = this.reverseEntry(txDb, entryId, actor, "corrected");
    const corrected = this.postVoucher(
      txDb,
      {
        partyId: original.partyId,
        debitPkr: correction.debitPkr,
        creditPkr: correction.creditPkr,
        description: `${correction.description || original.description} (corrects ${original.voucherNo})`,
        paymentMode: original.paymentMode,
      },
      actor
    );
    txDb.ledger = txDb.ledger.map((e) =>
      e.id === corrected.id ? { ...e, correctsEntryId: original.id } : e
    );
    return { reversal, corrected: { ...corrected, correctsEntryId: original.id } };
  },

  /**
   * Soft-archives a Party Khata Account (`isArchived: true`)
   */
  archivePartySoft(
    txDb: DatabaseSchema,
    partyId: string,
    actor: UserProfile
  ): void {
    const tenantId = txDb.tenant.id;
    const party = txDb.parties.find((p) => p.id === partyId);
    if (!party) return;

    txDb.parties = txDb.parties.map((p) =>
      p.id === partyId
        ? { ...p, isArchived: true, archivedAt: new Date().toISOString() }
        : p
    );

    appendAuditLog(txDb, {
      tenantId,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      module: "ACCOUNTING",
      action: "SOFT_ARCHIVE",
      entityType: "PartyAccount",
      entityId: partyId,
      summary: `Soft-archived Party Khata "${party.name}".`,
    });
  },

  listActiveParties(db: DatabaseSchema): PartyAccount[] {
    return db.parties.filter((p) => !p.isArchived);
  },
};
