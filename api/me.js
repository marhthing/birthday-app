import { requireSession } from "./_auth.js";

export const config = { runtime: "nodejs" };

export default function handler(req, res) {
  const session = requireSession(req);
  if (!session.ok) {
    res.status(401).json({ success: false, error: session.error });
    return;
  }

  res.status(200).json({
    success: true,
    user: {
      admin_id: session.user.admin_id,
      email: session.user.email,
      fullname: session.user.fullname || "",
      school: session.user.school || null,
    },
  });
}
