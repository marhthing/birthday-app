import crypto from "crypto";

function b64urlDecode(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64").toString("utf8");
}

function b64urlEncode(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function verifyPortalToken(token, secret) {
  if (!token || !secret) return { ok: false, error: "Missing token or secret." };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "Invalid token format." };

  const [headerB64, payloadB64, sigB64] = parts;
  const input = `${headerB64}.${payloadB64}`;
  const expected = crypto.createHmac("sha256", secret).update(input).digest();
  const expectedB64 = b64urlEncode(expected);
  if (!crypto.timingSafeEqual(Buffer.from(sigB64), Buffer.from(expectedB64))) {
    return { ok: false, error: "Bad signature." };
  }

  let payload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64));
  } catch {
    return { ok: false, error: "Invalid payload." };
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && now > payload.exp) {
    return { ok: false, error: "Token expired." };
  }
  if (payload.aud !== "sfgs-birthday-app") {
    return { ok: false, error: "Wrong audience." };
  }

  return { ok: true, payload };
}

export function signSessionToken(payload, secret, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const body = {
    ...payload,
    iss: "sfgs-birthday-app",
    aud: "sfgs-birthday-app",
    iat: now,
    exp: now + Math.max(60, Number(ttlSeconds) || 28800),
  };

  const headerB64 = b64urlEncode(JSON.stringify(header));
  const payloadB64 = b64urlEncode(JSON.stringify(body));
  const input = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac("sha256", secret).update(input).digest();
  const sigB64 = b64urlEncode(sig);
  return `${input}.${sigB64}`;
}

export function readCookie(req, name) {
  const header = req.headers.cookie || "";
  const parts = header.split(";").map((p) => p.trim());
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const key = part.slice(0, idx);
    const value = part.slice(idx + 1);
    if (key === name) return decodeURIComponent(value);
  }
  return "";
}

export function requireSession(req) {
  const secret = process.env.BIRTHDAY_SSO_SECRET || "";
  const token = readCookie(req, "sfgs_bday_sso");
  const verified = verifyPortalToken(token, secret);
  if (!verified.ok) return { ok: false, error: verified.error };
  return { ok: true, user: verified.payload };
}
