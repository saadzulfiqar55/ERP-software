import { NextResponse } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import { LedgerEntry, PartyAccount } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = readDb();

    // Case 1: Create a new Party Account (Customer Khata, Supplier, or Expense Head)
    if (body.action === "CREATE_PARTY") {
      const newParty: PartyAccount = {
        id: `party-${Date.now()}`,
        name: body.name,
        nameUrdu: body.nameUrdu || "",
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

    // Case 2: Post a Voucher (Receipt, Payment, Purchase Bill, or Expense)
    const partyIndex = db.parties.findIndex((p) => p.id === body.partyId);
    if (partyIndex === -1) {
      return NextResponse.json({ error: "Party account not found" }, { status: 404 });
    }

    const party = db.parties[partyIndex];
    const debit = Number(body.debit) || 0;
    const credit = Number(body.credit) || 0;

    // Balance logic: +Debit increases balance (Receivable / Paid to supplier), -Credit decreases balance (Payment received / Supplier bill)
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
      { error: err instanceof Error ? err.message : "Failed to record ledger entry" },
      { status: 400 }
    );
  }
}
