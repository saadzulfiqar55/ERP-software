import crypto from "crypto";
import { UserRole } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var __stacklyraEphemeralJwtSecret: string | undefined;
}

function getJwtSecret(): string {
  const configured = process.env.JWT_SECRET?.trim();
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    if (!globalThis.__stacklyraEphemeralJwtSecret) {
      globalThis.__stacklyraEphemeralJwtSecret = crypto
        .randomBytes(32)
        .toString("hex");
      console.warn(
        "[Security] JWT_SECRET is not set in production; generated an ephemeral per-process HMAC key."
      );
    }
    return globalThis.__stacklyraEphemeralJwtSecret;
  }

  return "albarka_pos_super_secret_hmac_sha256_key_2026";
}

export interface JWTPayload {
  sub: string; // userId
  name: string;
  role: UserRole;
  email: string;
  sid: string; // unique sessionId for single-active-session lock
  authMethod: "JWT_PIN" | "OAUTH_SSO";
  iat: number;
  exp: number;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input: string): string {
  let str = input.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4 !== 0) {
    str += "=";
  }
  return Buffer.from(str, "base64").toString("utf-8");
}

/**
 * Signs a standard RFC 7519 HS256 JWT token
 */
export function signJwt(
  payload: Omit<JWTPayload, "iat" | "exp">,
  expiresInSeconds: number = 8 * 60 * 60 // 8-hour POS shift default
): { token: string; fullPayload: JWTPayload } {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac("sha256", getJwtSecret())
    .update(signingInput)
    .digest();
  const encodedSignature = base64UrlEncode(signature);

  return {
    token: `${signingInput}.${encodedSignature}`,
    fullPayload,
  };
}

/**
 * Verifies an HS256 JWT token and checks expiration
 */
export function verifyJwt(token: string): JWTPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const expectedBuf = Buffer.from(
      base64UrlEncode(
        crypto
          .createHmac("sha256", getJwtSecret())
          .update(signingInput)
          .digest()
      ),
      "utf-8"
    );
    const actualBuf = Buffer.from(encodedSignature, "utf-8");

    if (
      expectedBuf.length !== actualBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, actualBuf)
    ) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JWTPayload;
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
