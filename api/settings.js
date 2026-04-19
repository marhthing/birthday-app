it isimport { requireSession } from "./_auth.js";
import { supabaseAdmin } from "./_supabase.js";

function supabaseFunctionUrlFromProjectUrl(projectUrl) {
  try {
    const u = new URL(projectUrl);
    const host = u.hostname; // <ref>.supabase.co
    const projectRef = host.split(".")[0] || "";
    if (!projectRef) return "";
    return `https://${projectRef}.functions.supabase.co/birthday-sender`;
  } catch {
    return "";
  }
}

export default async function handler(req, res) {
  const session = requireSession(req);
  if (!session.ok) {
    res.status(401).json({ success: false, error: session.error });
    return;
  }

  const supabase = supabaseAdmin();

  if (req.method === "GET") {
    const { data, error } = await supabase.from("birthday_settings").select("*").eq("id", 1).single();
    if (error) {
      res.status(500).json({ success: false, error: error.message });
      return;
    }

    const cronRes = await supabase.rpc("birthday_sender_cron_get");
    const cron = cronRes?.data?.[0] ?? null;

    res.status(200).json({ success: true, settings: data, cron });
    return;
  }

  if (req.method === "POST") {
    const body = typeof req.body === "object" && req.body ? req.body : {};
    const updates = {};

    if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
    updates.updated_at = new Date().toISOString();

    if (Object.keys(updates).length > 1) {
      const { data, error } = await supabase
        .from("birthday_settings")
        .update(updates)
        .eq("id", 1)
        .select("*")
        .single();

      if (error) {
        res.status(500).json({ success: false, error: error.message });
        return;
      }

      const shouldUpdateCron = typeof body.cron_schedule === "string" || typeof body.cron_active === "boolean";
      if (!shouldUpdateCron) {
        res.status(200).json({ success: true, settings: data });
        return;
      }
    }

    const shouldUpdateCron = typeof body.cron_schedule === "string" || typeof body.cron_active === "boolean";
    if (shouldUpdateCron) {
      const projectUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
      const functionUrl = supabaseFunctionUrlFromProjectUrl(projectUrl);
      if (!functionUrl) {
        res.status(500).json({ success: false, error: "Unable to derive Edge Function URL from SUPABASE_URL." });
        return;
      }

      const cronSchedule = typeof body.cron_schedule === "string" ? body.cron_schedule : "*/5 * * * *";
      const cronActive = typeof body.cron_active === "boolean" ? body.cron_active : true;

      const cronSet = await supabase.rpc("birthday_sender_cron_set", {
        p_schedule: cronSchedule,
        p_active: cronActive,
        p_function_url: functionUrl,
      });

      if (cronSet.error) {
        res.status(500).json({ success: false, error: cronSet.error.message });
        return;
      }

      const settingsRes = await supabase.from("birthday_settings").select("*").eq("id", 1).single();
      if (settingsRes.error) {
        res.status(500).json({ success: false, error: settingsRes.error.message });
        return;
      }

      res.status(200).json({ success: true, settings: settingsRes.data, cron: cronSet.data?.[0] ?? null });
      return;
    }

    const settingsRes = await supabase.from("birthday_settings").select("*").eq("id", 1).single();
    if (settingsRes.error) {
      res.status(500).json({ success: false, error: settingsRes.error.message });
      return;
    }

    res.status(200).json({ success: true, settings: settingsRes.data });
    return;
  }

  res.status(405).json({ success: false, error: "Method not allowed" });
}
