/**
 * Bulk import of menu / retail products and material stock from CSV, or from rows pasted
 * straight out of Excel / Google Sheets (tab-separated).
 *
 * Pure functions with no server or browser dependencies: the import dialog uses them to show a
 * preview with row-level errors, and the API route runs them again on the submitted text so the
 * server never trusts the client's parse.
 */
import type { BusinessSegment, KitchenStation, TaxMode } from "@/lib/types";

export const MAX_IMPORT_ROWS = 2000;

export type ImportKind = "products" | "stock";

export interface ImportIssue {
  /** 1-based line in the source file (the header is line 1). */
  line: number;
  message: string;
}

export interface ParsedProductVariant {
  name: string;
  price: number;
  costPrice: number;
}

export interface ParsedProductRow {
  line: number;
  code: string;
  name: string;
  nameUrdu: string;
  category: string;
  segment: BusinessSegment;
  kitchenStation: KitchenStation;
  taxMode: TaxMode;
  /** null = column absent / blank: keep the existing stock on update, 0 on create. */
  stockQty: number | null;
  unit: string;
  barcode: string;
  imageUrl: string;
  popular: boolean;
  variants: ParsedProductVariant[];
}

export interface ParsedStockRow {
  line: number;
  name: string;
  sku: string;
  currentQty: number;
  reorderTarget: number;
  unit: string;
}

export interface ParseResult<Row> {
  rows: Row[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  /** Header names that were recognised, in file order (for the preview). */
  recognisedColumns: string[];
  ignoredColumns: string[];
}

// ---------------------------------------------------------------------------------------------
// CSV / TSV tokenizer
// ---------------------------------------------------------------------------------------------

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const counts: Array<[string, number]> = [
    ["\t", (firstLine.match(/\t/g) || []).length],
    [",", (firstLine.match(/,/g) || []).length],
    [";", (firstLine.match(/;/g) || []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/** RFC 4180-style parser: quoted fields, doubled quotes, newlines inside quotes, CRLF, BOM. */
export function parseDelimited(text: string): { cells: string[][]; lines: number[] } {
  const src = text.replace(/^﻿/, "");
  const delimiter = detectDelimiter(src);
  const cells: string[][] = [];
  const lines: number[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;

  const endRow = () => {
    row.push(field);
    field = "";
    if (row.some((c) => c.trim() !== "")) {
      cells.push(row);
      lines.push(rowStartLine);
    }
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.trim() === "") {
      field = "";
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      endRow();
      line++;
      rowStartLine = line;
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) endRow();
  return { cells, lines };
}

// ---------------------------------------------------------------------------------------------
// Header mapping
// ---------------------------------------------------------------------------------------------

const normaliseHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

const PRODUCT_COLUMNS: Record<string, string[]> = {
  name: ["name", "itemname", "item", "dish", "dishname", "product", "productname", "title"],
  code: ["code", "sku", "itemcode", "productcode", "id", "menucode"],
  price: ["price", "saleprice", "sellingprice", "rate", "pricepkr", "mrp", "retailprice"],
  costPrice: ["cost", "costprice", "purchaseprice", "unitcost", "costpkr"],
  category: ["category", "group", "menucategory", "section", "department"],
  segment: ["segment", "type", "itemtype", "producttype"],
  variant: ["variant", "variantname", "size", "portion", "option"],
  stockQty: ["stock", "stockqty", "qty", "quantity", "onhand", "openingstock"],
  unit: ["unit", "uom", "units"],
  barcode: ["barcode", "ean", "upc", "gtin"],
  taxMode: ["taxmode", "tax", "taxtype", "gst"],
  kitchenStation: ["station", "kitchenstation", "kitchen", "printer"],
  nameUrdu: ["nameurdu", "urdu", "urduname", "localname"],
  imageUrl: ["image", "imageurl", "photo", "photourl", "picture"],
  popular: ["popular", "featured", "bestseller"],
};

const STOCK_COLUMNS: Record<string, string[]> = {
  name: ["name", "material", "materialname", "item", "itemname", "ingredient"],
  sku: ["sku", "code", "itemcode", "materialcode"],
  currentQty: ["qty", "quantity", "currentqty", "stock", "onhand", "openingstock"],
  reorderTarget: ["reorder", "reorderlevel", "reordertarget", "minqty", "minimum", "parlevel"],
  unit: ["unit", "uom", "units"],
};

function mapHeaders(header: string[], spec: Record<string, string[]>) {
  const index: Record<string, number> = {};
  const recognised: string[] = [];
  const ignored: string[] = [];
  header.forEach((raw, i) => {
    const key = normaliseHeader(raw);
    const field = Object.keys(spec).find((f) => spec[f].includes(key));
    if (field && index[field] === undefined) {
      index[field] = i;
      recognised.push(raw.trim());
    } else if (raw.trim()) {
      ignored.push(raw.trim());
    }
  });
  return { index, recognised, ignored };
}

// ---------------------------------------------------------------------------------------------
// Value parsing
// ---------------------------------------------------------------------------------------------

/** Accepts "1,250", "PKR 1250", "Rs. 1,250.50"; returns null when blank, NaN when invalid. */
function parseAmount(raw: string | undefined): number | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const cleaned = s.replace(/^(pkr|rs\.?|₨)\s*/i, "").replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

function parseSegment(raw: string): BusinessSegment | null {
  const s = normaliseHeader(raw);
  if (!s) return null;
  if (["restaurant", "menu", "food", "dish", "kitchen"].includes(s)) return "RESTAURANT";
  if (["retail", "product", "shop", "store", "goods", "stock"].includes(s)) return "RETAIL";
  return null;
}

function parseTaxMode(raw: string): TaxMode | null {
  const s = normaliseHeader(raw);
  if (!s) return null;
  if (["exclusive", "excl", "plus", "added"].includes(s)) return "EXCLUSIVE";
  if (["inclusive", "incl", "included"].includes(s)) return "INCLUSIVE";
  if (["exempt", "none", "zero", "notax", "0"].includes(s)) return "EXEMPT";
  return null;
}

const STATIONS: KitchenStation[] = [
  "KARAHI_HANDI",
  "BBQ_GRILL",
  "TANDOOR",
  "RICE_PULAO",
  "SWEET_RETAIL",
  "BEVERAGES",
];

function parseStation(raw: string): KitchenStation | null {
  const s = normaliseHeader(raw);
  if (!s) return null;
  const exact = STATIONS.find((st) => normaliseHeader(st) === s);
  if (exact) return exact;
  if (s.includes("bbq") || s.includes("grill")) return "BBQ_GRILL";
  if (s.includes("tandoor") || s.includes("naan") || s.includes("roti")) return "TANDOOR";
  if (s.includes("rice") || s.includes("pulao") || s.includes("biryani")) return "RICE_PULAO";
  if (s.includes("drink") || s.includes("beverage") || s.includes("bar")) return "BEVERAGES";
  if (s.includes("sweet") || s.includes("dessert") || s.includes("bakery") || s.includes("retail"))
    return "SWEET_RETAIL";
  if (s.includes("karahi") || s.includes("handi") || s.includes("main")) return "KARAHI_HANDI";
  return null;
}

/** Same heuristic the single-item form uses, extended to drinks and desserts. */
export function guessStation(category: string, segment: BusinessSegment): KitchenStation {
  if (segment === "RETAIL") return "SWEET_RETAIL";
  return parseStation(category) || "KARAHI_HANDI";
}

const truthy = (raw: string) => ["yes", "y", "true", "1", "x"].includes(raw.trim().toLowerCase());

// ---------------------------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------------------------

export function parseProductImport(
  text: string,
  defaults: { segment: BusinessSegment } = { segment: "RESTAURANT" }
): ParseResult<ParsedProductRow> {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const { cells, lines } = parseDelimited(text);
  if (cells.length === 0) {
    return { rows: [], errors: [{ line: 1, message: "The file is empty." }], warnings, recognisedColumns: [], ignoredColumns: [] };
  }
  const { index, recognised, ignored } = mapHeaders(cells[0], PRODUCT_COLUMNS);
  if (index.name === undefined || index.price === undefined) {
    const missing = [index.name === undefined && "Name", index.price === undefined && "Price"]
      .filter(Boolean)
      .join(" and ");
    errors.push({
      line: 1,
      message: `The header row needs a ${missing} column. Download the template to see the expected columns.`,
    });
    return { rows: [], errors, warnings, recognisedColumns: recognised, ignoredColumns: ignored };
  }
  if (cells.length - 1 > MAX_IMPORT_ROWS) {
    errors.push({
      line: 1,
      message: `This file has ${cells.length - 1} rows; import at most ${MAX_IMPORT_ROWS} at a time.`,
    });
    return { rows: [], errors, warnings, recognisedColumns: recognised, ignoredColumns: ignored };
  }

  const get = (row: string[], field: string) =>
    index[field] === undefined ? "" : (row[index[field]] ?? "").trim();

  // Rows sharing a code (or, without codes, a name) become variants of one product.
  const byKey = new Map<string, ParsedProductRow>();
  const rows: ParsedProductRow[] = [];

  for (let r = 1; r < cells.length; r++) {
    const row = cells[r];
    const line = lines[r];
    const name = get(row, "name");
    if (!name) {
      errors.push({ line, message: "Name is missing." });
      continue;
    }
    if (name.length > 120) {
      errors.push({ line, message: "Name is longer than 120 characters." });
      continue;
    }
    const price = parseAmount(get(row, "price"));
    if (price === null || Number.isNaN(price) || price < 0) {
      errors.push({ line, message: `Price "${get(row, "price")}" is not a valid amount.` });
      continue;
    }
    const costRaw = parseAmount(get(row, "costPrice"));
    if (costRaw !== null && (Number.isNaN(costRaw) || costRaw < 0)) {
      errors.push({ line, message: `Cost "${get(row, "costPrice")}" is not a valid amount.` });
      continue;
    }
    const stockRaw = parseAmount(get(row, "stockQty"));
    if (stockRaw !== null && (Number.isNaN(stockRaw) || stockRaw < 0)) {
      errors.push({ line, message: `Stock "${get(row, "stockQty")}" is not a valid quantity.` });
      continue;
    }

    const segmentText = get(row, "segment");
    let segment = parseSegment(segmentText);
    if (segmentText && !segment) {
      warnings.push({ line, message: `Type "${segmentText}" not recognised; using ${defaults.segment === "RETAIL" ? "Retail" : "Restaurant"}.` });
    }
    if (!segment) segment = defaults.segment;

    const taxText = get(row, "taxMode");
    let taxMode = parseTaxMode(taxText);
    if (taxText && !taxMode) warnings.push({ line, message: `Tax mode "${taxText}" not recognised; using Exclusive.` });
    if (!taxMode) taxMode = "EXCLUSIVE";

    const category = get(row, "category") || (segment === "RETAIL" ? "General" : "Main Course");
    const stationText = get(row, "kitchenStation");
    let station = parseStation(stationText);
    if (stationText && !station) warnings.push({ line, message: `Station "${stationText}" not recognised; guessed from the category.` });
    if (!station) station = guessStation(category, segment);

    const code = get(row, "code");
    if (code.length > 40) {
      errors.push({ line, message: "Code is longer than 40 characters." });
      continue;
    }
    const imageUrl = get(row, "imageUrl");
    if (imageUrl && !/^https:\/\//i.test(imageUrl)) {
      warnings.push({ line, message: "Image link ignored: it must start with https://." });
    }

    const variant: ParsedProductVariant = {
      name: get(row, "variant") || (segment === "RETAIL" ? "Standard" : "Full Portion"),
      price,
      costPrice: costRaw ?? Math.round(price * 0.6),
    };
    if (costRaw === null && index.costPrice !== undefined) {
      warnings.push({ line, message: "Cost is blank; estimated at 60% of price." });
    }

    const key = (code || `name:${name}`).toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      if (existing.variants.some((v) => v.name.toLowerCase() === variant.name.toLowerCase())) {
        errors.push({
          line,
          message: `Duplicate of line ${existing.line}: "${name}" already has a "${variant.name}" variant. Give each size its own Variant name.`,
        });
        continue;
      }
      existing.variants.push(variant);
      if (stockRaw !== null) existing.stockQty = (existing.stockQty ?? 0) + stockRaw;
      continue;
    }

    const parsed: ParsedProductRow = {
      line,
      code,
      name,
      nameUrdu: get(row, "nameUrdu"),
      category,
      segment,
      kitchenStation: station,
      taxMode,
      stockQty: stockRaw,
      unit: get(row, "unit") || (segment === "RETAIL" ? "pcs" : "Portion"),
      barcode: get(row, "barcode"),
      imageUrl: /^https:\/\//i.test(imageUrl) ? imageUrl : "",
      popular: truthy(get(row, "popular")),
      variants: [variant],
    };
    byKey.set(key, parsed);
    rows.push(parsed);
  }

  return { rows, errors, warnings, recognisedColumns: recognised, ignoredColumns: ignored };
}

export function parseStockImport(text: string): ParseResult<ParsedStockRow> {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const { cells, lines } = parseDelimited(text);
  if (cells.length === 0) {
    return { rows: [], errors: [{ line: 1, message: "The file is empty." }], warnings, recognisedColumns: [], ignoredColumns: [] };
  }
  const { index, recognised, ignored } = mapHeaders(cells[0], STOCK_COLUMNS);
  if (index.name === undefined) {
    errors.push({ line: 1, message: "The header row needs a Name column. Download the template to see the expected columns." });
    return { rows: [], errors, warnings, recognisedColumns: recognised, ignoredColumns: ignored };
  }
  if (cells.length - 1 > MAX_IMPORT_ROWS) {
    errors.push({ line: 1, message: `This file has ${cells.length - 1} rows; import at most ${MAX_IMPORT_ROWS} at a time.` });
    return { rows: [], errors, warnings, recognisedColumns: recognised, ignoredColumns: ignored };
  }
  const get = (row: string[], field: string) =>
    index[field] === undefined ? "" : (row[index[field]] ?? "").trim();

  const seen = new Map<string, number>();
  const rows: ParsedStockRow[] = [];
  for (let r = 1; r < cells.length; r++) {
    const row = cells[r];
    const line = lines[r];
    const name = get(row, "name");
    if (!name) {
      errors.push({ line, message: "Name is missing." });
      continue;
    }
    const qty = parseAmount(get(row, "currentQty"));
    if (qty !== null && (Number.isNaN(qty) || qty < 0)) {
      errors.push({ line, message: `Quantity "${get(row, "currentQty")}" is not a valid number.` });
      continue;
    }
    const reorder = parseAmount(get(row, "reorderTarget"));
    if (reorder !== null && (Number.isNaN(reorder) || reorder < 0)) {
      errors.push({ line, message: `Reorder level "${get(row, "reorderTarget")}" is not a valid number.` });
      continue;
    }
    const sku = get(row, "sku");
    const key = (sku || `name:${name}`).toLowerCase();
    if (seen.has(key)) {
      errors.push({ line, message: `Duplicate of line ${seen.get(key)} (same ${sku ? "SKU" : "name"}).` });
      continue;
    }
    seen.set(key, line);
    rows.push({
      line,
      name,
      sku,
      currentQty: qty ?? 0,
      reorderTarget: reorder === null || reorder < 1 ? 10 : reorder,
      unit: get(row, "unit") || "Units",
    });
  }
  return { rows, errors, warnings, recognisedColumns: recognised, ignoredColumns: ignored };
}

// ---------------------------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------------------------

export function productTemplateCsv(segment: BusinessSegment): string {
  if (segment === "RETAIL") {
    return [
      "Code,Name,Category,Variant,Price,Cost,Stock,Unit,Barcode,Tax Mode,Type",
      "R-1001,Basmati Rice 5kg,Grocery,Standard,2450,2100,40,bag,8961001000017,Exclusive,Retail",
      "R-1002,Cooking Oil,Grocery,1 Litre,690,610,60,bottle,,Exclusive,Retail",
      "R-1002,Cooking Oil,Grocery,5 Litre,3300,2950,15,bottle,,Exclusive,Retail",
      "",
    ].join("\r\n");
  }
  return [
    "Code,Name,Category,Variant,Price,Cost,Station,Tax Mode,Popular,Image URL",
    "101,Chicken Karahi,Karahi & Handi,Half,1450,850,Karahi,Exclusive,Yes,",
    "101,Chicken Karahi,Karahi & Handi,Full,2600,1500,Karahi,Exclusive,Yes,",
    "201,Seekh Kabab,BBQ,4 pcs,950,520,BBQ,Exclusive,,",
    "301,Garlic Naan,Tandoor,Standard,120,40,Tandoor,Exclusive,,",
    "401,Mint Margarita,Drinks,Glass,450,150,Beverages,Inclusive,,",
    "",
  ].join("\r\n");
}

export function stockTemplateCsv(): string {
  return [
    "SKU,Name,Quantity,Reorder Level,Unit",
    "MAT-001,Chicken (boneless),25,10,kg",
    "MAT-002,Cooking Oil,40,15,litre",
    "MAT-003,Basmati Rice,60,20,kg",
    "",
  ].join("\r\n");
}
