import { BrowserRouter, Route, Routes, Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { LogOut, User } from "lucide-react";
import Dashboard from "./pages/Dashboard.jsx";
import Footer from "./components/Footer.jsx";

const IDLE_MS = 5 * 60 * 1000;

function useIdleLogout(active) {
  const timer = useRef(null);

  useEffect(() => {
    if (!active) return;

    const doLogout = () => { window.location.href = "/api/logout"; };
    const reset = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(doLogout, IDLE_MS);
    };

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();

    return () => {
      clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [active]);
}

function Topbar({ user }) {
  const school = user?.school || null;
  const logoUrl = "/logo.png?v=1";

  const initials = user?.email
    ? user.email[0].toUpperCase()
    : "?";

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Link to="/" className="brand-link">
          <img className="brand-logo" src={logoUrl} alt="School logo" />
          <div className="brand-text">
            <span className="brand-name">{school?.name || "SFGS"}</span>
            <span className="brand-sub">Birthday Dashboard</span>
          </div>
        </Link>

        <div className="topbar-divider" />

        <span className="topbar-module">Email Automation</span>
      </div>

      <div className="topbar-right">
        {user ? (
          <>
            <div className="user-info">
              <div className="user-avatar">{initials}</div>
              <div className="user-meta">
                <span className="user-role">Administrator</span>
                <span className="user-email">{user.email}</span>
              </div>
            </div>
            <div className="topbar-sep" />
            <a className="signout-btn" href="/api/logout" title="Sign out">
              <LogOut size={15} />
              <span>Sign out</span>
            </a>
          </>
        ) : (
          <span className="topbar-badge">Portal SSO required</span>
        )}
      </div>
    </header>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setUser(data?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useIdleLogout(!!user);

  if (loading) {
    return (
      <div className="page">
        <div className="card">Loading…</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="layout">
        <Topbar user={user} />
        <div className="page">
          <Routes>
            <Route path="/" element={<Dashboard user={user} />} />
          </Routes>
        </div>
        <Footer school={user?.school || null} />
      </div>
    </BrowserRouter>
  );
}
