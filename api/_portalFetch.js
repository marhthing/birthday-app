import crypto from "crypto";

function hexToBytes(hex) {
  const clean = String(hex || "").trim();
  if (!clean || clean.length % 2 !== 0) return Buffer.alloc(0);
  return Buffer.from(clean, "hex");
}

function bytesToHex(bytes) {
  return Buffer.from(bytes).toString("hex");
}

function extractChallenge(html) {
  const text = String(html || "");

  // Example pattern:
  // var a=toNumbers("..."),b=toNumbers("..."),c=toNumbers("...");
  const abc =
    /var\s+a\s*=\s*toNumbers\("([0-9a-fA-F]+)"\)\s*,\s*b\s*=\s*toNumbers\("([0-9a-fA-F]+)"\)\s*,\s*c\s*=\s*toNumbers\("([0-9a-fA-F]+)"\)/m.exec(
      text,
    );
  const aHex = abc?.[1] || "";
  const bHex = abc?.[2] || "";
  const cHex = abc?.[3] || "";

  const redirectMatch =
    /location\.href\s*=\s*"([^"]+)"/m.exec(text) ||
    /window\.location\.href\s*=\s*"([^"]+)"/m.exec(text);
  const redirectUrl = redirectMatch?.[1] || "";

  if (!aHex || !bHex || !cHex) return null;
  return { aHex, bHex, cHex, redirectUrl };
}

function computeTestCookie({ aHex, bHex, cHex }) {
  const key = hexToBytes(aHex);
  const iv = hexToBytes(bHex);
  const cipher = hexToBytes(cHex);
  if (key.length !== 16 || iv.length !== 16 || cipher.length === 0 || cipher.length % 16 !== 0) {
    throw new Error("Invalid challenge crypto params.");
  }

  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(false);
  const plain = Buffer.concat([decipher.update(cipher), decipher.final()]);
  return bytesToHex(plain);
}

function looksLikeInfinityFreeChallenge(contentType, bodyText) {
  const ct = String(contentType || "").toLowerCase();
  const text = String(bodyText || "");
  if (ct.includes("application/json")) return false;
  return text.includes("slowAES.decrypt") && text.includes("document.cookie") && text.includes("__test=");
}

export async function fetchPortalJsonWithChallenge(url, headers, { maxAttempts = 4 } = {}) {
  let currentUrl = url;
  let cookieHeader = "";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(currentUrl, {
      headers: {
        ...headers,
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
    });

    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`Portal API failed (${res.status}): ${text.slice(0, 180)}`);
    }

    if (contentType.toLowerCase().includes("application/json")) {
      return JSON.parse(text);
    }

    if (!looksLikeInfinityFreeChallenge(contentType, text)) {
      throw new Error(`Portal did not return JSON: ${text.slice(0, 180)}`);
    }

    const challenge = extractChallenge(text);
    if (!challenge) {
      throw new Error(`Portal challenge not understood: ${text.slice(0, 180)}`);
    }

    const value = computeTestCookie(challenge);
    cookieHeader = `__test=${value}`;
    if (challenge.redirectUrl) {
      currentUrl = new URL(challenge.redirectUrl, currentUrl).toString();
    }
  }

  throw new Error("Portal challenge exceeded max attempts.");
}
