/**
 * Zero-Trust Boundary Validation & NoSQL Injection Sanitizer
 * Strips any MongoDB operator keys starting with '$' or containing '.'
 * and validates payload shapes strictly.
 */
export function sanitizeNoSqlPayload<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeNoSqlPayload(item)) as unknown as T;
  }
  if (typeof input === "object") {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      // Block NoSQL operator injection ($gt, $ne, $where, dot-notation)
      if (key.startsWith("$") || key.includes(".")) {
        continue;
      }
      clean[key] = sanitizeNoSqlPayload(value);
    }
    return clean as T;
  }
  return input;
}

export function assertNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Validation Error: "${fieldName}" must be a non-empty string.`);
  }
  return value.trim();
}

export function assertNonNegativeNumber(value: unknown, fieldName: string): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`Validation Error: "${fieldName}" must be a non-negative number.`);
  }
  return num;
}
