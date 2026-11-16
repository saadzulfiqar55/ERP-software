import { NextResponse } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import { LedgerEntry, PartyAccount } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = readDb();

    // 1. Create a new Party Account
    if (body.action === "CREATE_PARTY") {
      const newParty: PartyAccount = {
        id: `party-${Date.now()}`,
        name: body.name,
        nameUrdu: "",
        type: body.type,
        phone: body.phone || "-",
        ntnOrCnic: body.ntnOrCnic || "",
        creditLimit: Number(body.creditLimit) || 50000,
        currentBalance: Number(body.openingBalance) || 0,
        notes: body.notes || "",
      };
      db.parties = [newParty, ...db.parties];
      writeDb(db);
      return NextResponse.json({ db, party: newParty });
    }

    // 2. Edit an existing Party Account
    if (body.action === "EDIT_PARTY") {
      const updatedParty = body.party as PartyAccount;
      db.parties = db.parties.map((p) =>
        p.id === updatedParty.id ? { ...p, ...updatedParty } : p
      );
      // Also sync partyName on any ledger entries referencing this party
      db.ledger = db.ledger.map((entry) =>
        entry.partyId === updatedParty.id
          ? { ...entry, partyName: updatedParty.name, partyType: updatedParty.type }
          : entry
      );
      writeDb(db);
      return NextResponse.json({ db });
    }

    // 3. Delete a Party Account
    if (body.action === "DELETE_PARTY") {
      const targetPartyId = body.partyId as string;
      db.parties = db.parties.filter((p) => p.id !== targetPartyId);
      db.ledger = db.ledger.filter((e) => e.partyId !== targetPartyId);
      writeDb(db);
      return NextResponse.json({ db });
    }

    // 4. Edit an existing Ledger Voucher Entry (and recalculate Party balance)
    if (body.action === "EDIT_ENTRY") {
      const { entryId, description, debit, credit, voucherNo } = body as {
        entryId: string;
        description: string;
        debit: number;
        credit: number;
        voucherNo?: string;
      };
      const entryIdx = db.ledger.findIndex((e) => e.id === entryId);
      if (entryIdx === -1) {
        return NextResponse.json({ error: "Ledger entry not found" }, { status: 404 });
      }

      const oldEntry = db.ledger[entryIdx];
      const oldImpact = oldEntry.debit - oldEntry.credit;
      const newDebit = Number(debit) || 0;
      const newCredit = Number(credit) || 0;
      const newImpact = newDebit - newCredit;
      const deltaImpact = newImpact - oldImpact;

      // Adjust party currentBalance by delta
      const pIdx = db.parties.findIndex((p) => p.id === oldEntry.partyId);
      let updatedPartyBalance = oldEntry.balanceAfter + deltaImpact;
      if (pIdx !== -1) {
        updatedPartyBalance = db.parties[pIdx].currentBalance + deltaImpact;
        db.parties[pIdx] = {
          ...db.parties[pIdx],
          currentBalance: updatedPartyBalance,
        };
      }

      db.ledger[entryIdx] = {
        ...oldEntry,
        voucherNo: voucherNo || oldEntry.voucherNo,
        description: description || oldEntry.description,
        debit: newDebit,
        credit: newCredit,
        balanceAfter: oldEntry.balanceAfter + deltaImpact,
      };

      writeDb(db);
      return NextResponse.json({ db });
    }

    // 5. Delete a Ledger Voucher Entry (and reverse its effect on Party balance)
    if (body.action === "DELETE_ENTRY") {
      const targetEntryId = body.entryId as string;
      const entryToRemove = db.ledger.find((e) => e.id === targetEntryId);
      if (!entryToRemove) {
        return NextResponse.json({ error: "Ledger entry not found" }, { status: 404 });
      }

      const reverseDelta = -(entryToRemove.debit - entryToRemove.credit);
      const pIdx = db.parties.findIndex((p) => p.id === entryToRemove.partyId);
      if (pIdx !== -1) {
        db.parties[pIdx] = {
          ...db.parties[pIdx],
          currentBalance: db.parties[pIdx].currentBalance + reverseDelta,
        };
      }

      db.ledger = db.ledger.filter((e) => e.id !== targetEntryId);
      writeDb(db);
      return NextResponse.json({ db });
    }

    // 6. Default: Post a new Voucher (Receipt, Payment, Purchase Bill, or Expense)
    const partyIndex = db.parties.findIndex((p) => p.id === body.partyId);
    if (partyIndex === -1) {
      return NextResponse.json({ error: "Party account not found" }, { status: 404 });
    }

    const party = db.parties[partyIndex];
    const debit = Number(body.debit) || 0;
    const credit = Number(body.credit) || 0;

    const updatedBalance = party.currentBalance + debit - credit;
    db.parties[partyIndex] = {
      ...party,
      currentBalance: updatedBalance,
    };

    const nextVoucherNum = db.ledger.length + 101;
    const entry: LedgerEntry = {
      id: `led-${Date.now()}`,
      createdAt: new Date().toISOString(),
      partyId: party.id,
      partyName: party.name,
      partyType: party.type,
      voucherNo: body.voucherNo || `VCH-2026-${nextVoucherNum}`,
      description: body.description || "Ledger Voucher",
      paymentMode: body.paymentMode || "CASH",
      debit,
      credit,
      balanceAfter: updatedBalance,
    };

    db.ledger = [entry, ...db.ledger];
    writeDb(db);

    return NextResponse.json({ db, entry });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process ledger action" },
      { status: 400 }
    );
  }
}
