import { requireSession } from "./_auth.js";
import { supabaseAdmin } from "./_supabase.js";

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
    res.status(200).json({ success: true, settings: data });
    return;
  }

  if (req.method === "POST") {
    const body = typeof req.body === "object" && req.body ? req.body : {};
    const updates = {};

    if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
    updates.updated_at = new Date().toISOString();

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

    res.status(200).json({ success: true, settings: data });
    return;
  }

  res.status(405).json({ success: false, error: "Method not allowed" });
}
