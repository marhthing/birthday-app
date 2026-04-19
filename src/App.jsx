import { BrowserRouter, Route, Routes, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import Dashboard from "./pages/Dashboard.jsx";
import Footer from "./components/Footer.jsx";

function Topbar({ user }) {
  const school = user?.school || null;
  const logoUrl = "/logo.png?v=1";

  return (
    <div className="topbar">
      <div className="brand">
        <Link to="/" className="brand-link">
          {logoUrl ? <img className="brand-logo" src={logoUrl} alt="School logo" /> : null}
          <span>{school?.name || "SFGS Birthdays"}</span>
        </Link>
        <span className="brand-sub">Email sender dashboard</span>
      </div>
      <div className="topbar-right">
        {user ? (
          <>
            <span className="pill">{user.email}</span>
            <a className="btn btn-secondary" href="/api/logout">
              Sign out
            </a>
          </>
        ) : (
          <span className="pill">Portal SSO required</span>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setUser(data?.user ?? null);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

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
