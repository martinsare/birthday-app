import { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Save,
  Settings2,
  ChevronDown,
  ChevronUp,
  CakeSlice,
  Mail,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
  ToggleLeft,
  CalendarDays,
  User,
  Hash,
  GraduationCap,
  Cake,
} from "lucide-react";

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("application/json")) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `${url} returned ${res.status} (${ct || "no content-type"}): ${text.slice(0, 120)}`
    );
  }
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error || `HTTP ${res.status}`;
    throw new Error(`${url}: ${msg}`);
  }
  return data;
}

function cronForMinutes(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) return "*/5 * * * *";
  if (m === 1) return "* * * * *";
  return `*/${m} * * * *`;
}

function minutesFromCron(cron) {
  const s = String(cron || "").trim();
  if (s === "* * * * *") return 1;
  const match = /^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/.exec(s);
  if (!match) return "";
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : "";
}

function normalizeLogStatus(status, showQueued = false) {
  if (status === "pending") return showQueued ? "queued" : "failed";
  if (status === "queued") return showQueued ? "queued" : "failed";
  return status || "";
}

function getLogStatusMeta(status, showQueued = false) {
  const normalized = normalizeLogStatus(status, showQueued);
  if (normalized === "sent") {
    return { label: "sent", className: "ok", Icon: CheckCircle2 };
  }
  if (normalized === "failed") {
    return { label: "failed", className: "bad", Icon: XCircle };
  }
  return { label: "sending", className: "warn", Icon: Clock };
}

const PAGE_SIZE = 10;

function usePagination(items) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [items.length]);

  return { page: safePage, setPage, totalPages, slice };
}

function Pagination({ page, totalPages, setPage, total }) {
  if (totalPages <= 1) return null;
  return (
    <div className="pagination">
      <span className="pagination-info">
        Page {page} of {totalPages} &bull; {total} record{total !== 1 ? "s" : ""}
      </span>
      <div className="pagination-controls">
        <button
          className="page-btn"
          onClick={() => setPage(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={15} />
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
          .reduce((acc, p, idx, arr) => {
            if (idx > 0 && p - arr[idx - 1] > 1) {
              acc.push(<span key={`ellipsis-${p}`} className="page-ellipsis">…</span>);
            }
            acc.push(
              <button
                key={p}
                className={`page-btn${p === page ? " active" : ""}`}
                onClick={() => setPage(p)}
              >
                {p}
              </button>
            );
            return acc;
          }, [])}
        <button
          className="page-btn"
          onClick={() => setPage(page + 1)}
          disabled={page === totalPages}
          aria-label="Next page"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

export default function Dashboard({ user }) {
  const [settings, setSettings] = useState(null);
  const [cron, setCron] = useState(null);
  const [logs, setLogs] = useState([]);
  const [birthdays, setBirthdays] = useState([]);
  const [birthdayDate, setBirthdayDate] = useState("");
  const [birthdayError, setBirthdayError] = useState("");
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showAdvancedCron, setShowAdvancedCron] = useState(false);
  const [cronDirty, setCronDirty] = useState(false);
  const [lastRun, setLastRun] = useState(null);

  const [bdSearch, setBdSearch] = useState("");
  const [logSearch, setLogSearch] = useState("");
  const [logStatusFilter, setLogStatusFilter] = useState("all");

  const load = async () => {
    setStatus(null);
    setBirthdayError("");
    try {
      const [settingsRes, runsRes, logsRes, birthdaysRes] = await Promise.all([
        fetchJson("/api/settings"),
        fetchJson("/api/runs?limit=1"),
        fetchJson("/api/logs?limit=200"),
        fetchJson("/api/birthdays?limit=200"),
      ]);

      if (!settingsRes.success || !runsRes.success || !logsRes.success) {
        setStatus(settingsRes.error || runsRes.error || logsRes.error || "Unable to load data.");
        return;
      }

      setSettings(settingsRes.settings ?? null);
      setCron(settingsRes.cron ?? null);
      setCronDirty(false);
      setLastRun(runsRes.runs && runsRes.runs[0] ? runsRes.runs[0] : null);
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
    return {
      lastRunAt: lastRun?.ran_at ?? settings?.last_run_at ?? null,
      lastStatus: lastRun?.status ?? "",
      lastSent: lastRun?.sent_count ?? settings?.last_run_sent ?? 0,
      lastFailed: lastRun?.failed_count ?? settings?.last_run_failed ?? 0,
    };
  }, [lastRun, settings]);
  const showQueuedLogs = lastRun?.status === "running";

  const updateSettings = async (updates) => {
    if (!settings) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetchJson("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updates),
      });

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

  const filteredBirthdays = useMemo(() => {
    const q = bdSearch.toLowerCase().trim();
    if (!q) return birthdays;
    return birthdays.filter(
      (b) =>
        (b.name || "").toLowerCase().includes(q) ||
        (b.reg_number || "").toLowerCase().includes(q) ||
        (b.class || "").toLowerCase().includes(q)
    );
  }, [birthdays, bdSearch]);

  const filteredLogs = useMemo(() => {
    const q = logSearch.toLowerCase().trim();
    return logs.filter((l) => {
      const statusValue = normalizeLogStatus(l.status, showQueuedLogs);
      const matchesSearch =
        !q ||
        (l.student_name || "").toLowerCase().includes(q) ||
        (l.recipient_email || "").toLowerCase().includes(q) ||
        (l.date || "").toLowerCase().includes(q);
      const matchesStatus =
        logStatusFilter === "all" || statusValue === logStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [logs, logSearch, logStatusFilter, showQueuedLogs]);

  const bdPagination = usePagination(filteredBirthdays);
  const logPagination = usePagination(filteredLogs);

  if (!user) {
    return (
      <div className="splash">
        <div className="splash-glow splash-glow-1" />
        <div className="splash-glow splash-glow-2" />

        <div className="splash-card">
          <div className="splash-logo-wrap">
            <div className="splash-logo-ring" />
            <img src="/logo.png?v=1" alt="SFGS logo" className="splash-logo" />
          </div>

          <div className="splash-badge">
            <CakeSlice size={12} />
            Birthday Automation System
          </div>

          <h1 className="splash-title">
            Sure Foundation<br />Group of Schools
          </h1>
          <p className="splash-subtitle">Birthday Email Dashboard</p>

          <div className="splash-divider" />

          <div className="splash-steps">
            <div className="splash-step">
              <div className="splash-step-num">1</div>
              <div className="splash-step-text">
                Log in to the <strong>SFGS Portal</strong>
              </div>
            </div>
            <div className="splash-step-arrow">→</div>
            <div className="splash-step">
              <div className="splash-step-num">2</div>
              <div className="splash-step-text">
                Open <strong>Birthdays</strong> from the sidebar
              </div>
            </div>
            <div className="splash-step-arrow">→</div>
            <div className="splash-step">
              <div className="splash-step-num">3</div>
              <div className="splash-step-text">
                Dashboard loads <strong>automatically</strong>
              </div>
            </div>
          </div>

          <a
            className="splash-cta"
            href="https://portal.sfgs.com.ng/"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Mail size={16} />
            Go to SFGS Portal
          </a>

          <p className="splash-note">
            Access is granted via portal single sign-on only.
          </p>
        </div>

      </div>
    );
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="section-header">
          <CakeSlice size={18} className="section-icon" />
          <h2 className="h2">Today&apos;s Birthdays</h2>
        </div>
        <div className="muted" style={{ marginBottom: 12 }}>
          <CalendarDays size={13} style={{ verticalAlign: "middle", marginRight: 4 }} />
          {birthdayDate ? `Date: ${birthdayDate}` : "Date: —"}&nbsp;&bull;&nbsp;
          {birthdays.length} student{birthdays.length !== 1 ? "s" : ""}
        </div>

        {birthdayError && (
          <div className="notice error">
            <AlertTriangle size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
            {birthdayError}
          </div>
        )}

        <div className="search-bar">
          <Search size={15} className="search-icon" />
          <input
            className="search-input"
            type="search"
            placeholder="Search by name, reg no, or class…"
            value={bdSearch}
            onChange={(e) => setBdSearch(e.target.value)}
          />
        </div>

        {filteredBirthdays.length === 0 ? (
          <div className="muted empty-state">
            <CakeSlice size={32} opacity={0.3} />
            <span>No birthdays found{bdSearch ? " matching your search" : " for today"}.</span>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <div className="table table-birthdays">
                <div className="thead">
                  <div><User size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />Student</div>
                  <div><Hash size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />Reg No</div>
                  <div><GraduationCap size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />Class</div>
                  <div><Cake size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />Age</div>
                </div>
                {bdPagination.slice.map((b) => (
                  <div key={`${b.reg_number}-${b.name}`} className="trow">
                    <div className="cell-strong">{b.name}</div>
                    <div className="mono">{b.reg_number}</div>
                    <div>{b.class}</div>
                    <div>{b.age ?? "—"}</div>
                  </div>
                ))}
              </div>
            </div>
            <Pagination
              page={bdPagination.page}
              totalPages={bdPagination.totalPages}
              setPage={bdPagination.setPage}
              total={filteredBirthdays.length}
            />
          </>
        )}
      </div>

      <div className="grid">
        <div className="card">
          <div className="section-header">
            <CheckCircle2 size={18} className="section-icon" />
            <h2 className="h2">Status</h2>
          </div>
          <div className="kv">
            <div className="k">
              <Clock size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />
              Last run
            </div>
            <div className="v">{formatDateTime(summary.lastRunAt) || "—"}</div>
            <div className="k">
              <CheckCircle2 size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />
              Last status
            </div>
            <div className="v">
              {summary.lastStatus ? (
                <span className={`tag ${summary.lastStatus === "ok" || summary.lastStatus === "success" ? "ok" : "bad"}`}>
                  {summary.lastStatus}
                </span>
              ) : "—"}
            </div>
            <div className="k">
              <Send size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />
              Last sent
            </div>
            <div className="v">{summary.lastSent}</div>
            <div className="k">
              <XCircle size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />
              Last failed
            </div>
            <div className="v">{summary.lastFailed}</div>
          </div>
          <button className="btn btn-secondary" type="button" onClick={load}>
            <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
            Refresh
          </button>
        </div>

        <div className="card">
          <div className="section-header">
            <Settings2 size={18} className="section-icon" />
            <h2 className="h2">Settings</h2>
          </div>
          {settings ? (
            <div className="form">
              <label className="label">
                <span className="label-text">
                  <ToggleLeft size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />
                  Enabled
                </span>
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
                <span className="label-text">
                  <Clock size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />
                  Cron enabled
                </span>
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
                <span className="label-text">Run every</span>
                <select
                  className="input"
                  value={minutesFromCron(cron?.schedule) || 5}
                  onChange={(e) => {
                    const minutes = Number(e.target.value);
                    setCron((c) => ({ ...(c || {}), schedule: cronForMinutes(minutes) }));
                    setCronDirty(true);
                  }}
                  disabled={saving}
                >
                  <option value={1}>1 minute</option>
                  <option value={5}>5 minutes</option>
                  <option value={10}>10 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>60 minutes</option>
                </select>
              </label>

              <button
                className="btn btn-primary"
                type="button"
                onClick={async () => {
                  await updateSettings({ cron_schedule: cron?.schedule ?? "*/5 * * * *" });
                  setCronDirty(false);
                }}
                disabled={saving || !cronDirty}
              >
                <Save size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
                Save scheduler
              </button>

              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setShowAdvancedCron((v) => !v)}
                disabled={saving}
              >
                {showAdvancedCron ? (
                  <ChevronUp size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
                ) : (
                  <ChevronDown size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
                )}
                {showAdvancedCron ? "Hide advanced" : "Advanced"}
              </button>

              {showAdvancedCron && (
                <label className="label">
                  <span className="label-text">Cron expression</span>
                  <input
                    className="input"
                    value={cron?.schedule ?? "*/5 * * * *"}
                    onChange={(e) => setCron((c) => ({ ...(c || {}), schedule: e.target.value }))}
                    disabled={saving}
                    placeholder="*/5 * * * *"
                  />
                  <div className="muted">Format: minute hour day month weekday</div>
                </label>
              )}
            </div>
          ) : (
            <div className="muted">
              No settings row found. Run the SQL in <code>supabase/schema.sql</code>.
            </div>
          )}
        </div>
      </div>

      {status && (
        <div className="notice error">
          <AlertTriangle size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
          {status}
        </div>
      )}

      <div className="card">
        <div className="section-header">
          <Mail size={18} className="section-icon" />
          <h2 className="h2">Recent Emails</h2>
        </div>

        <div className="filter-bar">
          <div className="search-bar" style={{ flex: 1 }}>
            <Search size={15} className="search-icon" />
            <input
              className="search-input"
              type="search"
              placeholder="Search by student, email, or date…"
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
            />
          </div>
          <select
            className="filter-select"
            value={logStatusFilter}
            onChange={(e) => setLogStatusFilter(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div className="table-scroll">
          <div className="table">
            <div className="thead">
              <div><Clock size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />Time</div>
              <div><CalendarDays size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />Date</div>
              <div><User size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />Student</div>
              <div><Mail size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />Recipient</div>
              <div>Status</div>
              <div><AlertTriangle size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />Error</div>
            </div>
            {filteredLogs.length === 0 ? (
              <div className="trow-empty">
                <Mail size={32} opacity={0.25} />
                <span>{logs.length === 0 ? "No emails yet." : "No results match your filter."}</span>
              </div>
            ) : (
              logPagination.slice.map((l) => {
                const statusMeta = getLogStatusMeta(l.status, showQueuedLogs);
                return (
                  <div key={l.id} className="trow">
                    <div>{formatDateTime(l.created_at)}</div>
                    <div>{l.date}</div>
                    <div>{l.student_name}</div>
                    <div className="mono">{l.recipient_email}</div>
                    <div>
                      <span className={`tag ${statusMeta.className}`}>
                        <statusMeta.Icon size={11} style={{ marginRight: 4 }} />
                        {statusMeta.label}
                      </span>
                    </div>
                    <div className="mono">{l.error || ""}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <Pagination
          page={logPagination.page}
          totalPages={logPagination.totalPages}
          setPage={logPagination.setPage}
          total={filteredLogs.length}
        />
      </div>
    </div>
  );
}
