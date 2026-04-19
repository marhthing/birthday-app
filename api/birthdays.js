import { requireSession } from "./_auth.js";
import { fetchPortalJsonWithChallenge } from "./_portalFetch.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  const session = requireSession(req);
  if (!session.ok) {
    res.status(401).json({ success: false, error: session.error });
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ success: false, error: "Method not allowed" });
    return;
  }

  try {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 200)));
    const baseUrl =
      process.env.PORTAL_BIRTHDAYS_API_URL || "https://portal.sfgs.com.ng/?page=birthdays_api";
    const token = (process.env.PORTAL_BIRTHDAYS_API_TOKEN || "").trim();
    if (!token) {
      res.status(500).json({ success: false, error: "Missing PORTAL_BIRTHDAYS_API_TOKEN" });
      return;
    }

    const url = new URL(baseUrl);
    url.searchParams.set("limit", String(limit));

    const data = await fetchPortalJsonWithChallenge(url.toString(), {
      accept: "application/json",
      "x-portal-token": token,
      // Mimic a browser to reduce the chance of being challenged.
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      "accept-language": "en-GB,en;q=0.9",
    });

    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ success: false, error: e instanceof Error ? e.message : "Request failed" });
  }
}
