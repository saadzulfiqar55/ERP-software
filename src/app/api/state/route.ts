import { NextResponse } from "next/server";
import { readDb, writeDb } from "@/lib/db";
import { pingMongoConnection, syncSnapshotToMongoIfAvailable } from "@/lib/mongodb";
import { MongoDBConfig, PRAConfig, Product } from "@/lib/types";

export async function GET() {
  const db = readDb();
  return NextResponse.json(db);
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const db = readDb();

    if (body.praConfig) {
      db.praConfig = { ...db.praConfig, ...(body.praConfig as Partial<PRAConfig>) };
    }

    if (body.mongoConfig) {
      const nextMongo = {
        ...db.mongoConfig,
        ...(body.mongoConfig as Partial<MongoDBConfig>),
      };
      const pingResult = await pingMongoConnection(nextMongo.uri);
      nextMongo.lastStatus = `${pingResult.engine}: ${pingResult.message}`;
      nextMongo.enabled = pingResult.connected;
      db.mongoConfig = nextMongo;
    }

    if (body.newProduct) {
      const prod = body.newProduct as Product;
      db.products = [prod, ...db.products];
    }

    if (body.updateProductImage) {
      const { productId, imageUrl } = body.updateProductImage as {
        productId: string;
        imageUrl: string;
      };
      db.products = db.products.map((p) =>
        p.id === productId ? { ...p, imageUrl } : p
      );
    }

    if (body.updateStock) {
      const { productId, stockQty } = body.updateStock as {
        productId: string;
        stockQty: number;
      };
      db.products = db.products.map((p) =>
        p.id === productId ? { ...p, stockQty } : p
      );
    }

    writeDb(db);

    if (db.mongoConfig.uri) {
      await syncSnapshotToMongoIfAvailable(
        db.mongoConfig.uri,
        db.mongoConfig.dbName,
        db
      );
    }

    return NextResponse.json(db);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update state" },
      { status: 400 }
    );
  }
}
