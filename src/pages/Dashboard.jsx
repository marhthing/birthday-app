import { useEffect, useMemo, useState } from "react";

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

export default function Dashboard({ user }) {
  const [settings, setSettings] = useState(null);
  const [cron, setCron] = useState(null);
  const [runs, setRuns] = useState([]);
  const [logs, setLogs] = useState([]);
  const [birthdays, setBirthdays] = useState([]);
  const [birthdayDate, setBirthdayDate] = useState("");
  const [birthdayError, setBirthdayError] = useState("");
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setStatus(null);
    setBirthdayError("");
    try {
      const [settingsRes, runsRes, logsRes, birthdaysRes] = await Promise.all([
        fetch("/api/settings").then((r) => r.json()),
        fetch("/api/runs?limit=20").then((r) => r.json()),
        fetch("/api/logs?limit=50").then((r) => r.json()),
        fetch("/api/birthdays?limit=200").then((r) => r.json()),
      ]);

      if (!settingsRes.success || !runsRes.success || !logsRes.success) {
        setStatus(settingsRes.error || runsRes.error || logsRes.error || "Unable to load data.");
        return;
      }

      setSettings(settingsRes.settings ?? null);
      setCron(settingsRes.cron ?? null);
      setRuns(runsRes.runs ?? []);
      setLogs(logsRes.logs ?? []);

      if (birthdaysRes?.success) {
        setBirthdays(Array.isArray(birthdaysRes.birthdays) ? birthdaysRes.birthdays : []);
        setBirthdayDate(String(birthdaysRes.date || ""));
      } else if (birthdaysRes && birthdaysRes.success === false) {
        setBirthdays([]);
        setBirthdayDate("");
        setBirthdayError(birthdaysRes.error || "Unable to load birthdays.");
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Unable to load data.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(() => {
    const last = runs?.[0];
    return {
      lastRunAt: last?.ran_at ?? settings?.last_run_at ?? null,
      lastStatus: last?.status ?? "",
      lastSent: settings?.last_run_sent ?? 0,
      lastFailed: settings?.last_run_failed ?? 0,
    };
  }, [runs, settings]);

  const updateSettings = async (updates) => {
    if (!settings) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updates),
      }).then((r) => r.json());

      if (!res.success) {
        setStatus(res.error || "Unable to save settings.");
        return;
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Unable to save settings.");
      return;
    } finally {
      setSaving(false);
    }
    await load();
  };

  if (!user) {
    return (
      <div className="card">
        <h1 className="h1">Open from the Portal</h1>
        <p className="muted">
          This dashboard uses portal single sign-on. Open it from the SFGS portal sidebar: <strong>Birthdays</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="card">
        <h2 className="h2">Today&apos;s Birthdays</h2>
        <div className="muted" style={{ marginBottom: 10 }}>
          {birthdayDate ? `Date: ${birthdayDate}` : "Date: —"} • {birthdays.length} student(s)
        </div>

        {birthdayError && <div className="notice error">{birthdayError}</div>}

        {birthdays.length === 0 ? (
          <div className="muted">No birthdays found for today.</div>
        ) : (
          <div className="table-scroll">
            <div className="table table-birthdays">
              <div className="thead">
                <div>Student</div>
                <div>Reg No</div>
                <div>Class</div>
                <div>Age</div>
              </div>
              {birthdays.map((b) => (
                <div key={`${b.reg_number}-${b.name}`} className="trow">
                  <div className="cell-strong">{b.name}</div>
                  <div className="mono">{b.reg_number}</div>
                  <div>{b.class}</div>
                  <div>{b.age ?? "—"}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid">
        <div className="card">
          <h2 className="h2">Status</h2>
          <div className="kv">
            <div className="k">Last run</div>
            <div className="v">{formatDateTime(summary.lastRunAt) || "—"}</div>
            <div className="k">Last status</div>
            <div className="v">{summary.lastStatus || "—"}</div>
            <div className="k">Last sent</div>
            <div className="v">{summary.lastSent}</div>
            <div className="k">Last failed</div>
            <div className="v">{summary.lastFailed}</div>
          </div>
          <button className="btn btn-secondary" type="button" onClick={load}>
            Refresh
          </button>
        </div>

        <div className="card">
          <h2 className="h2">Settings</h2>
          {settings ? (
            <div className="form">
              <label className="label">
                Enabled
                <select
                  className="input"
                  value={settings.enabled ? "yes" : "no"}
                  onChange={(e) => updateSettings({ enabled: e.target.value === "yes" })}
                  disabled={saving}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>

              <div className="divider" />

              <div className="muted" style={{ marginTop: 4 }}>
                Scheduler (Supabase Cron)
              </div>

              <label className="label">
                Cron enabled
                <select
                  className="input"
                  value={cron?.active ? "yes" : "no"}
                  onChange={(e) => updateSettings({ cron_active: e.target.value === "yes" })}
                  disabled={saving}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>

              <label className="label">
                Interval (cron)
                <input
                  className="input"
                  value={cron?.schedule ?? "*/5 * * * *"}
                  onChange={(e) => setCron((c) => ({ ...(c || {}), schedule: e.target.value }))}
                  disabled={saving}
                  placeholder="*/5 * * * *"
                />
                <div className="muted">Example: */5 * * * * (every 5 minutes), * * * * * (every minute)</div>
              </label>

              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => updateSettings({ cron_schedule: cron?.schedule ?? "*/5 * * * *" })}
                disabled={saving}
              >
                Save scheduler
              </button>
            </div>
          ) : (
            <div className="muted">No settings row found. Run the SQL in `birthday-app/supabase/schema.sql`.</div>
          )}
        </div>
      </div>

      {status && <div className="notice error">{status}</div>}

      <div className="card">
        <h2 className="h2">Recent runs</h2>
        <div className="table-scroll">
        <div className="table">
          <div className="thead">
            <div>Ran at</div>
            <div>Date</div>
            <div>Birthdays</div>
            <div>Sent</div>
            <div>Failed</div>
            <div>Status</div>
          </div>
          {runs.length === 0 ? (
            <div className="trow muted">No runs yet.</div>
          ) : (
            runs.map((r) => (
              <div key={r.id} className="trow">
                <div>{formatDateTime(r.ran_at)}</div>
                <div>{r.date}</div>
                <div>{r.birthday_count}</div>
                <div>{r.sent_count}</div>
                <div>{r.failed_count}</div>
                <div>{r.status}</div>
              </div>
            ))
          )}
        </div>
        </div>
      </div>

      <div className="card">
        <h2 className="h2">Recent emails</h2>
        <div className="table-scroll">
        <div className="table">
          <div className="thead">
            <div>Time</div>
            <div>Date</div>
            <div>Student</div>
            <div>Recipient</div>
            <div>Status</div>
            <div>Error</div>
          </div>
          {logs.length === 0 ? (
            <div className="trow muted">No emails yet.</div>
          ) : (
            logs.map((l) => (
              <div key={l.id} className="trow">
                <div>{formatDateTime(l.created_at)}</div>
                <div>{l.date}</div>
                <div>{l.student_name}</div>
                <div>{l.recipient_email}</div>
                <div>
                  <span className={`tag ${l.status === "sent" ? "ok" : "bad"}`}>{l.status}</span>
                </div>
                <div className="mono">{l.error || ""}</div>
              </div>
            ))
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
