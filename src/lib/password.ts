import crypto from "node:crypto";

/**
 * Hashes a user password with a random 16-byte salt using Node's native scrypt KDF.
 */
export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(plain, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

/**
 * Constant-time verification against a stored `scrypt$<salt>$<hex>` hash.
 */
export function verifyPassword(plain: string, storedHash?: string): boolean {
  if (!plain || !storedHash) return false;
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;

  try {
    const derived = crypto.scryptSync(plain, salt, 64);
    const expected = Buffer.from(expectedHex, "hex");
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * Hashes a 4-digit staff PIN with the same salted scrypt KDF as passwords.
 * A 4-digit PIN has only 10,000 values, so the hash alone does not stop offline guessing;
 * the real protection is the per-profile lockout enforced at sign-in.
 */
export function hashPin(pin: string): string {
  return hashPassword(pin);
}

/**
 * Verifies a PIN against `pinHash`, falling back to a legacy plaintext `pin`
 * (constant-time) for profiles that have not been migrated yet.
 */
export function verifyPin(
  provided: string,
  user: { pinHash?: string; pin?: string }
): boolean {
  if (!provided) return false;
  if (user.pinHash) return verifyPassword(provided, user.pinHash);
  if (user.pin) return timingSafeEqualStrings(provided, user.pin);
  return false;
}

/**
 * Converts any legacy plaintext PINs on the given profiles into `pinHash` in place.
 * Returns true when at least one profile changed.
 */
export function migrateLegacyPins(users: Array<{ pin?: string; pinHash?: string }>): boolean {
  let changed = false;
  for (const u of users) {
    if (u.pin && !u.pinHash) {
      u.pinHash = hashPin(u.pin);
      u.pin = "";
      changed = true;
    } else if (u.pin && u.pinHash) {
      u.pin = "";
      changed = true;
    }
  }
  return changed;
}

/**
 * Constant-time string equality check (used for optional ADMIN_PASSWORD env override).
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
