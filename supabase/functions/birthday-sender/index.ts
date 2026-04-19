// Supabase Edge Function: birthday-sender
// Schedules can call this function frequently; it enforces its own interval via DB settings.

// VS Code / TypeScript (non-Deno) type shim:
// Supabase Edge Functions run on Deno, but the TS language server may not know `Deno`.
declare const Deno: {
  env: { get: (key: string) => string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

type BirthdayRow = {
  name: string;
  class: string;
  reg_number: string;
  age: number | null;
  parent_email: string | null;
  parent_email_alt: string | null;
};

type PortalResponse = {
  success: boolean;
  date: string;
  count: number;
  birthdays: BirthdayRow[];
};

type TriggerPayload = Partial<PortalResponse> & {
  dry_run?: boolean;
  portal_data?: PortalResponse;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
};

function env(key: string, fallback = ""): string {
  return Deno.env.get(key) ?? fallback;
}

function nowIso(): string {
  return new Date().toISOString();
}

function minutesBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 60000);
}

async function supabaseRpc(
  supabaseUrl: string,
  serviceRoleKey: string,
  fnName: string,
  payload: Record<string, unknown>,
) {
  const url = `${supabaseUrl}/rest/v1/rpc/${fnName}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...jsonHeaders,
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase RPC failed (${res.status}): ${text}`);
  }
  return await res.json();
}

async function supabaseInsert(
  supabaseUrl: string,
  serviceRoleKey: string,
  table: string,
  row: Record<string, unknown>,
) {
  const url = `${supabaseUrl}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...jsonHeaders,
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase insert failed (${res.status}): ${text}`);
  }
  return await res.json();
}

async function supabaseUpsertIgnoreDuplicates(
  supabaseUrl: string,
  serviceRoleKey: string,
  table: string,
  row: Record<string, unknown>,
  onConflict: string,
) {
  const url = `${supabaseUrl}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...jsonHeaders,
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      prefer: "resolution=ignore-duplicates,return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase upsert failed (${res.status}): ${text}`);
  }
  return await res.json();
}

async function supabaseUpdate(
  supabaseUrl: string,
  serviceRoleKey: string,
  table: string,
  match: Record<string, string>,
  updates: Record<string, unknown>,
) {
  const query = new URLSearchParams(match).toString();
  const url = `${supabaseUrl}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      ...jsonHeaders,
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      prefer: "return=representation",
    },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase update failed (${res.status}): ${text}`);
  }
  return await res.json();
}

function lagosDateParts(): { year: number; month: number; day: number; iso: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const iso = `${get("year")}-${get("month")}-${get("day")}`;
  return { year, month, day, iso };
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean === "" || clean.length % 2 !== 0) return new Uint8Array();
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let hex = "";
  for (const b of u8) hex += b.toString(16).padStart(2, "0");
  return hex;
}

function extractChallenge(html: string): { aHex: string; bHex: string; cHex: string; redirectUrl: string } | null {
  const abc = /var\s+a\s*=\s*toNumbers\("([0-9a-fA-F]+)"\)\s*,\s*b\s*=\s*toNumbers\("([0-9a-fA-F]+)"\)\s*,\s*c\s*=\s*toNumbers\("([0-9a-fA-F]+)"\)/m
    .exec(html);
  const aHex = abc?.[1] ?? "";
  const bHex = abc?.[2] ?? "";
  const cHex = abc?.[3] ?? "";

  const redirectMatch = /location\.href\s*=\s*"([^"]+)"/m.exec(html) ?? /window\.location\.href\s*=\s*"([^"]+)"/m.exec(html);
  const redirectUrl = redirectMatch?.[1] ?? "";

  if (!aHex || !bHex || !cHex) return null;
  return { aHex, bHex, cHex, redirectUrl };
}

function looksLikeChallenge(contentType: string, bodyText: string): boolean {
  const ct = contentType.toLowerCase();
  if (ct.includes("application/json")) return false;
  return bodyText.includes("slowAES.decrypt") && bodyText.includes("document.cookie") && bodyText.includes("__test=");
}

async function computeTestCookieValue(ch: { aHex: string; bHex: string; cHex: string }): Promise<string> {
  const keyBytes = hexToBytes(ch.aHex);
  const ivBytes = hexToBytes(ch.bHex);
  const cipherBytes = hexToBytes(ch.cHex);
  if (keyBytes.length !== 16 || ivBytes.length !== 16 || cipherBytes.length === 0 || cipherBytes.length % 16 !== 0) {
    throw new Error("Invalid challenge crypto params.");
  }

  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv: ivBytes }, cryptoKey, cipherBytes);
  return bytesToHex(plain);
}

async function fetchPortalBirthdaysWithChallenge(apiUrl: string, token: string, maxAttempts = 4): Promise<PortalResponse> {
  let currentUrl = apiUrl;
  let cookieHeader = "";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(currentUrl, {
      headers: {
        accept: "application/json",
        "x-portal-token": token,
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "accept-language": "en-GB,en;q=0.9",
      },
    });

    const contentType = res.headers.get("content-type") ?? "";
    const bodyText = await res.text();

    if (!res.ok) {
      throw new Error(`Portal API failed (${res.status}): ${bodyText.slice(0, 180)}`);
    }

    if (contentType.toLowerCase().includes("application/json")) {
      const parsed = JSON.parse(bodyText) as PortalResponse;
      if (!parsed?.success) throw new Error("Portal API returned success=false.");
      return parsed;
    }

    if (!looksLikeChallenge(contentType, bodyText)) {
      throw new Error(`Portal API did not return JSON: ${bodyText.slice(0, 180)}`);
    }

    const challenge = extractChallenge(bodyText);
    if (!challenge) throw new Error(`Portal challenge not understood: ${bodyText.slice(0, 180)}`);

    const cookieValue = await computeTestCookieValue(challenge);
    cookieHeader = `__test=${cookieValue}`;
    if (challenge.redirectUrl) {
      currentUrl = new URL(challenge.redirectUrl, currentUrl).toString();
    }
  }

  throw new Error("Portal challenge exceeded max attempts.");
}

function buildEmailHtml(studentName: string): string {
  const name = (studentName || "").trim() || "your child";
  return `
    <div style="font-family:'Georgia','Times New Roman',serif;color:#222;font-size:16px;padding:0;margin:0;">
      <p>Dear Parent,</p>
      <p>Happy Birthday to ${name}!</p>
      <p>
        Everyone at Sure Foundation Group of School wishes your child a wonderful day filled with joy and happiness.<br>
        May this new year bring growth, learning, and many cherished moments.
      </p>
      <p style="margin-top:32px;">Warm regards,<br>SURE FOUNDATION GROUP OF SCHOOL</p>
    </div>
  `.trim();
}

async function sendBrevoEmail(
  apiKey: string,
  senderEmail: string,
  senderName: string,
  toEmail: string,
  subject: string,
  htmlContent: string,
) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      ...jsonHeaders,
      accept: "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: toEmail }],
      subject,
      htmlContent,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Brevo send failed (${res.status}): ${text}`);
  }
  return JSON.parse(text);
}

function dedupeEmails(row: BirthdayRow): string[] {
  const emails = [row.parent_email, row.parent_email_alt]
    .map((e) => (e ?? "").trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(emails));
}

async function readJsonBody(req: Request): Promise<TriggerPayload | null> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return null;
  try {
    return await req.json();
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        ...jsonHeaders,
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const url = new URL(req.url);
    const payload = await readJsonBody(req);
    const dryRun = url.searchParams.get("dry_run") === "1" || payload?.dry_run === true;

    const supabaseUrl = env("SUPABASE_URL");
    const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const portalApiUrl = env("PORTAL_BIRTHDAYS_API_URL");
    const portalToken = env("PORTAL_BIRTHDAYS_API_TOKEN");
    const brevoKey = env("BREVO_API_KEY");
    const senderEmail = env("BREVO_SENDER_EMAIL");
    const senderName = env("BREVO_SENDER_NAME", "SFGS");

    if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase env vars.");
    if (!dryRun && (!portalApiUrl || !portalToken)) throw new Error("Missing portal API env vars.");
    if (!dryRun && (!brevoKey || !senderEmail)) throw new Error("Missing Brevo env vars.");

    const portalDataFromBody = payload?.portal_data ?? (
      payload?.success === true && payload?.date && payload?.count !== undefined && Array.isArray(payload?.birthdays)
        ? payload as PortalResponse
        : null
    );

    const portalData = portalDataFromBody ?? await fetchPortalBirthdaysWithChallenge(portalApiUrl, portalToken);

    // Log run start
    const run = (await supabaseInsert(supabaseUrl, serviceRoleKey, "birthday_runs", {
      ran_at: nowIso(),
      date: portalData.date,
      birthday_count: portalData.count,
      status: "running",
    }))[0] as Record<string, unknown> | undefined;
    const runId = Number(run?.id ?? 0);

    let sent = 0;
    let failed = 0;
    for (const birthday of portalData.birthdays || []) {
      const recipients = dedupeEmails(birthday);
      if (recipients.length === 0) continue;

      for (const email of recipients) {
        const subject = `Happy Birthday ${birthday.name}!`;
        try {
          // Reserve first (prevents double-send across concurrent runs).
          // Dedupe by unique constraint: (date, reg_number, recipient_email)
          const pendingRows = await supabaseUpsertIgnoreDuplicates(
            supabaseUrl,
            serviceRoleKey,
            "birthday_email_logs",
            {
              run_id: runId || null,
              date: portalData.date,
              reg_number: birthday.reg_number,
              student_name: birthday.name,
              recipient_email: email,
              status: "pending",
              provider_message_id: null,
              error: null,
              created_at: nowIso(),
            },
            "date,reg_number,recipient_email",
          );

          const pending = pendingRows?.[0];
          const logId = Number(pending?.id ?? 0);
          if (!logId) {
            // Already reserved/sent earlier today.
            continue;
          }

          const brevo = dryRun
            ? { messageId: "dry_run" }
            : await sendBrevoEmail(
              brevoKey,
              senderEmail,
              senderName,
              email,
              subject,
              buildEmailHtml(birthday.name),
            );

          await supabaseUpdate(
            supabaseUrl,
            serviceRoleKey,
            "birthday_email_logs",
            { id: `eq.${logId}` },
            {
              run_id: runId || null,
              status: "sent",
              provider_message_id: brevo?.messageId ?? null,
              error: null,
            },
          );
          sent++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          try {
            // If the reservation insert failed due to duplicates we would have skipped,
            // but for other failures, try to write a standalone failed record.
            await supabaseUpsertIgnoreDuplicates(
              supabaseUrl,
              serviceRoleKey,
              "birthday_email_logs",
              {
                run_id: runId || null,
                date: portalData.date,
                reg_number: birthday.reg_number,
                student_name: birthday.name,
                recipient_email: email,
                status: "failed",
                provider_message_id: null,
                error: message,
                created_at: nowIso(),
              },
              "date,reg_number,recipient_email",
            );
          } catch {
            // ignore logging failures
          }
          failed++;
        }
      }
    }

    if (runId) {
      await supabaseUpdate(supabaseUrl, serviceRoleKey, "birthday_runs", { id: `eq.${runId}` }, {
        status: "completed",
        sent_count: sent,
        failed_count: failed,
        completed_at: nowIso(),
      });
    }

    await supabaseUpdate(supabaseUrl, serviceRoleKey, "birthday_settings", { id: "eq.1" }, {
      last_run_at: nowIso(),
      last_run_sent: sent,
      last_run_failed: failed,
    });

    return new Response(JSON.stringify({ success: true, date: portalData.date, sent, failed, dry_run: dryRun }), {
      headers: jsonHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ success: false, error: message }), {
      headers: jsonHeaders,
      status: 500,
    });
  }
});
