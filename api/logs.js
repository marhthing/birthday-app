import { requireSession } from "./_auth.js";
import { supabaseAdmin } from "./_supabase.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const session = requireSession(req);
  if (!session.ok) {
    res.status(401).json({ success: false, error: session.error });
    return;
  }

  const supabase = supabaseAdmin();
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));

  const { data, error } = await supabase
    .from("birthday_email_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    res.status(500).json({ success: false, error: error.message });
    return;
  }

  res.status(200).json({ success: true, logs: data ?? [] });
}
