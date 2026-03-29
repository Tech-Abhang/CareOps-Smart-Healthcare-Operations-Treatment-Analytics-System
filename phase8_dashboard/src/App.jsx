import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./App.css";

const C = {
  cases: "#0c8fb1",
  recovery: "#2a9d6f",
  readmit: "#d95f45",
  cost: "#c88424",
  neutral: "#6b7280",
};

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { to: "/patients", label: "Patients", icon: "group" },
  { to: "/facility", label: "Facility", icon: "local_hospital" },
  { to: "/analytics", label: "Analytics", icon: "analytics" },
  { to: "/readmission", label: "Readmission", icon: "monitoring" },
  { to: "/tables", label: "Tables", icon: "table_chart" },
];

const L0 = { cube: true, meta: true, quality: true, alerts: true };
const DB_NOT_CONFIGURED_CODE = "DB_NOT_CONFIGURED";

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fCount = (v) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(num(v));
const fPct = (v) => `${num(v).toFixed(1)}%`;
const fCost = (v) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(num(v));
const fDate = (v) => {
  if (!v) return "n/a";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-US");
};
const delta = (a, b) => {
  if (!num(b)) return null;
  return ((num(a) - num(b)) / num(b)) * 100;
};

async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function agg(rows, keyFn, seedFn, mergeFn) {
  const m = new Map();
  rows.forEach((r) => {
    const k = keyFn(r);
    const s = m.get(k) || seedFn(r);
    mergeFn(s, r);
    m.set(k, s);
  });
  return [...m.values()];
}

function Widget({ loading, error, children, minHeight = 240 }) {
  if (loading) {
    return (
      <div className="widget-state" style={{ minHeight }}>
        <div className="skeleton-line large" />
        <div className="skeleton-line" />
        <div className="skeleton-line short" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="widget-state error" style={{ minHeight }}>
        <p>{error}</p>
      </div>
    );
  }
  return children;
}

function App() {
  const [from, setFrom] = useState("2022-01-01");
  const [to, setTo] = useState("2023-12-31");
  const [topN, setTopN] = useState(8);
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [fDisease, setFDisease] = useState("all");
  const [fDoctor, setFDoctor] = useState("all");
  const [fWard, setFWard] = useState("all");

  const [cube, setCube] = useState([]);
  const [meta, setMeta] = useState(null);
  const [quality, setQuality] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [tableInventory, setTableInventory] = useState(null);
  const [loading, setLoading] = useState(L0);
  const [errors, setErrors] = useState({});
  const [tablesLoading, setTablesLoading] = useState(true);
  const [tablesError, setTablesError] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [dbConfigured, setDbConfigured] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [statusRefreshing, setStatusRefreshing] = useState(false);

  const q = useMemo(
    () => new URLSearchParams({ from, to }).toString(),
    [from, to],
  );

  const checkSessionStatus = useCallback(async () => {
    setStatusRefreshing(true);
    setAuthError("");

    try {
      const response = await fetch("/api/session/status");
      const payload = await readJsonSafe(response);

      if (!response.ok) {
        throw new Error(payload?.message || "Failed to read session status.");
      }

      setDbConfigured(Boolean(payload?.configured));
    } catch (error) {
      setDbConfigured(false);
      setAuthError(error.message || "Could not connect to the API server.");
    } finally {
      setAuthChecked(true);
      setStatusRefreshing(false);
    }
  }, []);

  const handleConfigureDatabase = useCallback(
    async (event) => {
      event.preventDefault();
      if (authSubmitting) return;

      if (passwordInput.length === 0) {
        setAuthError("Enter your MySQL password.");
        return;
      }

      setAuthSubmitting(true);
      setAuthError("");

      try {
        const response = await fetch("/api/session/configure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: passwordInput }),
        });
        const payload = await readJsonSafe(response);

        if (!response.ok) {
          throw new Error(
            payload?.message ||
              `Failed to configure database session (${response.status}).`,
          );
        }

        setPasswordInput("");
        setDbConfigured(true);
      } catch (error) {
        setDbConfigured(false);
        setAuthError(error.message || "Database authentication failed.");
      } finally {
        setAuthSubmitting(false);
      }
    },
    [authSubmitting, passwordInput],
  );

  useEffect(() => {
    checkSessionStatus();
  }, [checkSessionStatus]);

  useEffect(() => {
    if (dbConfigured) return;

    setCube([]);
    setMeta(null);
    setQuality(null);
    setAlerts([]);
    setTableInventory(null);
    setLoading(L0);
    setErrors({});
    setTablesLoading(true);
    setTablesError("");
  }, [dbConfigured]);

  useEffect(() => {
    if (!dbConfigured) return undefined;

    let dead = false;
    const ctl = new AbortController();
    const specs = [
      { k: "cube", u: `/api/analytics-cube?${q}` },
      { k: "meta", u: "/api/meta" },
      { k: "quality", u: "/api/data-quality" },
      { k: "alerts", u: "/api/alerts" },
    ];
    setLoading(L0);
    setErrors({});

    Promise.allSettled(
      specs.map(async ({ k, u }) => {
        const r = await fetch(u, { signal: ctl.signal });
        const payload = await readJsonSafe(r);
        if (!r.ok) {
          if (payload?.code === DB_NOT_CONFIGURED_CODE) {
            setDbConfigured(false);
          }
          throw new Error(payload?.message || `${k} failed (${r.status})`);
        }
        return { k, data: payload };
      }),
    ).then((res) => {
      if (dead) return;
      const e = {};
      res.forEach((x, i) => {
        const k = specs[i].k;
        if (x.status === "rejected") {
          e[k] = x.reason?.message || `${k} failed`;
          return;
        }
        if (k === "cube")
          setCube(Array.isArray(x.value.data) ? x.value.data : []);
        if (k === "meta") setMeta(x.value.data);
        if (k === "quality") setQuality(x.value.data);
        if (k === "alerts")
          setAlerts(Array.isArray(x.value.data) ? x.value.data : []);
      });
      setErrors(e);
      setLoading({ cube: false, meta: false, quality: false, alerts: false });
    });
    return () => {
      dead = true;
      ctl.abort();
    };
  }, [dbConfigured, q]);

  useEffect(() => {
    if (!dbConfigured) return undefined;

    let dead = false;
    const ctl = new AbortController();
    setTablesLoading(true);
    setTablesError("");

    fetch("/api/table-inventory", { signal: ctl.signal })
      .then((response) => {
        return readJsonSafe(response).then((payload) => {
          if (!response.ok) {
            if (payload?.code === DB_NOT_CONFIGURED_CODE) {
              setDbConfigured(false);
            }
            throw new Error(
              payload?.message || `table inventory failed (${response.status})`,
            );
          }
          return payload;
        });
      })
      .then((payload) => {
        if (dead) return;
        setTableInventory(payload);
        setTablesError("");
        setTablesLoading(false);
      })
      .catch((error) => {
        if (dead || error.name === "AbortError") return;
        setTablesError(error.message || "Failed to load table inventory");
        setTablesLoading(false);
      });

    return () => {
      dead = true;
      ctl.abort();
    };
  }, [dbConfigured]);

  const options = useMemo(() => {
    const ds = new Map();
    const docs = new Map();
    const wards = new Map();
    cube.forEach((r) => {
      if (r.diseaseCode)
        ds.set(r.diseaseCode, `${r.diseaseCode} - ${r.diseaseName}`);
      if (r.doctorId)
        docs.set(String(r.doctorId), `Dr ${r.doctorId} - ${r.specialization}`);
      if (r.wardId)
        wards.set(String(r.wardId), r.wardName || `Ward ${r.wardId}`);
    });
    const toOpts = (m) =>
      [...m.entries()].map(([value, label]) => ({ value, label }));
    return { ds: toOpts(ds), docs: toOpts(docs), wards: toOpts(wards) };
  }, [cube]);

  const filtered = useMemo(
    () =>
      cube.filter((r) => {
        if (fDisease !== "all" && r.diseaseCode !== fDisease) return false;
        if (fDoctor !== "all" && String(r.doctorId) !== fDoctor) return false;
        if (fWard !== "all" && String(r.wardId) !== fWard) return false;
        return true;
      }),
    [cube, fDisease, fDoctor, fWard],
  );

  const trend = useMemo(
    () =>
      agg(
        filtered,
        (r) => r.monthLabel,
        (r) => ({
          monthLabel: r.monthLabel,
          totalCases: 0,
          recoveredCases: 0,
          readmittedCases: 0,
          costW: 0,
        }),
        (a, r) => {
          const c = num(r.totalCases);
          a.totalCases += c;
          a.recoveredCases += num(r.recoveredCases);
          a.readmittedCases += num(r.readmittedCases);
          a.costW += num(r.avgCost) * c;
        },
      )
        .map((r) => ({
          ...r,
          avgCost: r.totalCases ? r.costW / r.totalCases : 0,
        }))
        .sort((a, b) => a.monthLabel.localeCompare(b.monthLabel)),
    [filtered],
  );

  const overview = useMemo(() => {
    const totalCases = filtered.reduce((s, r) => s + num(r.totalCases), 0);
    const recoveredCases = filtered.reduce(
      (s, r) => s + num(r.recoveredCases),
      0,
    );
    const readmittedCases = filtered.reduce(
      (s, r) => s + num(r.readmittedCases),
      0,
    );
    const costW = filtered.reduce(
      (s, r) => s + num(r.avgCost) * num(r.totalCases),
      0,
    );
    return {
      totalCases,
      recoveredCases,
      readmittedCases,
      recoveryRatePct: totalCases ? (recoveredCases / totalCases) * 100 : 0,
      readmissionRatePct: totalCases ? (readmittedCases / totalCases) * 100 : 0,
      avgTreatmentCost: totalCases ? costW / totalCases : 0,
    };
  }, [filtered]);

  const disease = useMemo(
    () =>
      agg(
        filtered,
        (r) => r.diseaseCode,
        (r) => ({
          diseaseCode: r.diseaseCode,
          diseaseName: r.diseaseName,
          totalCases: 0,
          readmittedCases: 0,
        }),
        (a, r) => {
          a.totalCases += num(r.totalCases);
          a.readmittedCases += num(r.readmittedCases);
        },
      )
        .map((r) => ({
          ...r,
          readmissionRatePct: r.totalCases
            ? (r.readmittedCases / r.totalCases) * 100
            : 0,
        }))
        .sort((a, b) => b.totalCases - a.totalCases),
    [filtered],
  );

  const doctors = useMemo(
    () =>
      agg(
        filtered,
        (r) => String(r.doctorId),
        (r) => ({
          doctorId: r.doctorId,
          specialization: r.specialization,
          totalCases: 0,
          recoveredCases: 0,
        }),
        (a, r) => {
          a.totalCases += num(r.totalCases);
          a.recoveredCases += num(r.recoveredCases);
        },
      )
        .map((r) => ({
          ...r,
          recoveryRatePct: r.totalCases
            ? (r.recoveredCases / r.totalCases) * 100
            : 0,
        }))
        .sort((a, b) => b.recoveryRatePct - a.recoveryRatePct),
    [filtered],
  );

  const wards = useMemo(
    () =>
      agg(
        filtered,
        (r) => String(r.wardId || "none"),
        (r) => ({
          wardId: r.wardId,
          wardName: r.wardName || "Unassigned",
          capacity: num(r.capacity),
          bedDays: 0,
        }),
        (a, r) => {
          a.bedDays += num(r.totalBedDays);
        },
      )
        .map((r) => ({
          ...r,
          bedDaysPerCapacity:
            r.capacity > 0 ? r.bedDays / r.capacity : r.bedDays,
        }))
        .sort((a, b) => b.bedDaysPerCapacity - a.bedDaysPerCapacity),
    [filtered],
  );

  const patients = useMemo(
    () =>
      alerts
        .map((a) => ({
          id: `PX-${String(a.patientId).padStart(4, "0")}`,
          condition: a.alertMessage || "Observation required",
          days: num(a.daysStayed),
          date: fDate(a.createdAt),
          ward: String(a.wardId || "none"),
        }))
        .filter(
          (r) =>
            (fWard === "all" || r.ward === fWard) &&
            `${r.id} ${r.condition}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        ),
    [alerts, fWard, search],
  );

  const risk = useMemo(() => {
    const c = { Critical: 0, "High Risk": 0, Stable: 0 };
    patients.forEach((p) => {
      c[p.days >= 10 ? "Critical" : p.days >= 7 ? "High Risk" : "Stable"] += 1;
    });
    return [
      { name: "Critical", value: c.Critical, color: C.readmit },
      { name: "High Risk", value: c["High Risk"], color: C.cases },
      { name: "Stable", value: c.Stable, color: C.recovery },
    ];
  }, [patients]);

  const lm = trend.at(-1);
  const pm = trend.at(-2);
  const exec = [
    {
      t: "Total Cases",
      v: fCount(overview.totalCases),
      d: delta(lm?.totalCases, pm?.totalCases),
      s: trend.map((r) => r.totalCases),
      c: C.cases,
    },
    {
      t: "Recovery Rate",
      v: fPct(overview.recoveryRatePct),
      d: delta(
        (lm?.recoveredCases / Math.max(lm?.totalCases || 1, 1)) * 100,
        (pm?.recoveredCases / Math.max(pm?.totalCases || 1, 1)) * 100,
      ),
      s: trend.map(
        (r) => (r.recoveredCases / Math.max(r.totalCases || 1, 1)) * 100,
      ),
      c: C.recovery,
    },
    {
      t: "Readmission Rate",
      v: fPct(overview.readmissionRatePct),
      d: delta(
        (lm?.readmittedCases / Math.max(lm?.totalCases || 1, 1)) * 100,
        (pm?.readmittedCases / Math.max(pm?.totalCases || 1, 1)) * 100,
      ),
      s: trend.map(
        (r) => (r.readmittedCases / Math.max(r.totalCases || 1, 1)) * 100,
      ),
      c: C.readmit,
    },
    {
      t: "Avg Cost",
      v: fCost(overview.avgTreatmentCost),
      d: delta(lm?.avgCost, pm?.avgCost),
      s: trend.map((r) => r.avgCost),
      c: C.cost,
    },
  ];

  if (!authChecked) {
    return (
      <div className="auth-gate">
        <article className="auth-card">
          <h1>CareOps</h1>
          <p>Checking database session...</p>
        </article>
      </div>
    );
  }

  if (!dbConfigured) {
    return (
      <div className="auth-gate">
        <form className="auth-card" onSubmit={handleConfigureDatabase}>
          <h1>CareOps</h1>
          <p>Enter MySQL password to unlock dashboard data.</p>
          <label className="auth-label" htmlFor="db-password">
            MySQL Password
          </label>
          <input
            id="db-password"
            type="password"
            value={passwordInput}
            onChange={(event) => setPasswordInput(event.target.value)}
            autoFocus
            autoComplete="current-password"
          />
          <div className="auth-actions">
            <button
              type="submit"
              className="auth-submit"
              disabled={authSubmitting || statusRefreshing}
            >
              {authSubmitting ? "Connecting..." : "Unlock Dashboard"}
            </button>
            <button
              type="button"
              className="text-btn"
              onClick={checkSessionStatus}
              disabled={authSubmitting || statusRefreshing}
            >
              {statusRefreshing ? "Refreshing..." : "Refresh Status"}
            </button>
          </div>
          <p className="auth-hint">
            The password is only used in memory for the current server run.
          </p>
          {authError ? <p className="auth-error">{authError}</p> : null}
        </form>
      </div>
    );
  }

  const shared = {
    topN,
    setTopN,
    loading,
    errors,
    meta,
    quality,
    trend,
    overview,
    disease,
    doctors,
    wards,
    patients,
    risk,
    exec,
    fDisease,
    fDoctor,
    fWard,
    setFDisease,
    setFDoctor,
    setFWard,
    tableInventory,
    tablesLoading,
    tablesError,
    search,
  };

  return (
    <BrowserRouter>
      <div className="careops-layout">
        <aside className={`side-nav ${menuOpen ? "open" : ""}`}>
          <div className="brand-wrap">
            <p className="eyebrow">Hospital Ops</p>
            <h1>CareOps</h1>
            <span>Decision Console</span>
          </div>
          <nav className="nav-links">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  isActive ? "nav-item active" : "nav-item"
                }
                onClick={() => setMenuOpen(false)}
              >
                <span className="material-symbols-outlined">{n.icon}</span>
                <span>{n.label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>
        {menuOpen ? (
          <button
            className="screen-overlay"
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation"
          />
        ) : null}
        <main className="careops-main">
          <header className="top-bar">
            <button
              className="icon-btn nav-toggle"
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation"
            >
              <span className="material-symbols-outlined">menu</span>
            </button>
            <div className="search-wrap">
              <span className="material-symbols-outlined">search</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search patients, conditions, tables, or columns"
              />
            </div>
            <button
              className="icon-btn"
              type="button"
              onClick={() => setSheetOpen((v) => !v)}
              aria-label="Open filters"
            >
              <span className="material-symbols-outlined">tune</span>
            </button>
          </header>
          <section className={`filter-sheet ${sheetOpen ? "open" : ""}`}>
            <div className="sheet-head">
              <h3>Global Filters</h3>
              <button
                className="text-btn"
                type="button"
                onClick={() => {
                  setFDisease("all");
                  setFDoctor("all");
                  setFWard("all");
                }}
              >
                Clear
              </button>
            </div>
            <div className="sheet-grid">
              <label>
                From
                <input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setLoading(L0);
                    setErrors({});
                    setFrom(e.target.value);
                  }}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setLoading(L0);
                    setErrors({});
                    setTo(e.target.value);
                  }}
                />
              </label>
              <label>
                Disease
                <select
                  value={fDisease}
                  onChange={(e) => setFDisease(e.target.value)}
                >
                  <option value="all">All</option>
                  {options.ds.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Doctor
                <select
                  value={fDoctor}
                  onChange={(e) => setFDoctor(e.target.value)}
                >
                  <option value="all">All</option>
                  {options.docs.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ward
                <select
                  value={fWard}
                  onChange={(e) => setFWard(e.target.value)}
                >
                  <option value="all">All</option>
                  {options.wards.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          <section className="careops-content">
            <Routes>
              <Route path="/" element={<Dashboard {...shared} />} />
              <Route path="/dashboard" element={<Dashboard {...shared} />} />
              <Route path="/patients" element={<Patients {...shared} />} />
              <Route path="/facility" element={<Facility {...shared} />} />
              <Route path="/analytics" element={<Analytics {...shared} />} />
              <Route
                path="/readmission"
                element={<Readmission {...shared} />}
              />
              <Route path="/tables" element={<Tables {...shared} />} />
            </Routes>
          </section>
        </main>
      </div>
    </BrowserRouter>
  );
}

function ExecCard({ t, v, d, s, c }) {
  const data = s.map((p, i) => ({ i, p }));
  const label =
    d === null ? "No prior month" : `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;
  const cls = d === null ? "flat" : d >= 0 ? "up" : "down";
  return (
    <article className="executive-card">
      <p>{t}</p>
      <h3>{v}</h3>
      <span className={`delta-pill ${cls}`}>{label}</span>
      <div className="sparkline-box">
        <ResponsiveContainer width="100%" height={50}>
          <LineChart data={data}>
            <Line dataKey="p" stroke={c} strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function Section({ title, insight, kpi, loading, error, children }) {
  return (
    <article className="narrative-card">
      <div className="card-head">
        <div>
          <h3>{title}</h3>
          <p>{insight}</p>
        </div>
        <div className="narrative-kpi">
          <span>{kpi.label}</span>
          <strong>{kpi.value}</strong>
        </div>
      </div>
      <Widget loading={loading} error={error}>
        {children}
      </Widget>
    </article>
  );
}

function TopN({ topN, setTopN }) {
  return (
    <div className="toggle-wrap">
      {[5, 8, 12].map((n) => (
        <button
          key={n}
          type="button"
          className={topN === n ? "toggle-btn active" : "toggle-btn"}
          onClick={() => setTopN(n)}
        >
          Top {n}
        </button>
      ))}
    </div>
  );
}

function Dashboard({
  topN,
  setTopN,
  loading,
  errors,
  meta,
  quality,
  trend,
  overview,
  disease,
  wards,
  exec,
  fDisease,
  fDoctor,
  fWard,
  setFDisease,
  setFDoctor,
  setFWard,
}) {
  const warnings = [];
  if (num(quality?.missingDiseaseKeys) > 0)
    warnings.push("Missing disease keys");
  if (num(quality?.missingDoctorKeys) > 0) warnings.push("Missing doctor keys");
  if (num(quality?.missingWardKeys) > 0) warnings.push("Missing ward keys");
  if (num(quality?.stalenessDays) > 30)
    warnings.push("Data older than 30 days");

  return (
    <div className="page-grid">
      <section className="page-header">
        <h2>Executive Overview</h2>
        <p>
          Last fact date: {fDate(meta?.lastFactDate)} | Rows:{" "}
          {fCount(meta?.factRows)}
        </p>
      </section>
      <section className="executive-strip">
        {exec.map((k) => (
          <ExecCard key={k.t} {...k} />
        ))}
      </section>
      <div className="filter-chip-row">
        <span className="chip-title">Active:</span>
        <button
          type="button"
          className={fDisease === "all" ? "chip" : "chip active"}
          onClick={() => setFDisease("all")}
        >
          Disease: {fDisease}
        </button>
        <button
          type="button"
          className={fDoctor === "all" ? "chip" : "chip active"}
          onClick={() => setFDoctor("all")}
        >
          Doctor: {fDoctor}
        </button>
        <button
          type="button"
          className={fWard === "all" ? "chip" : "chip active"}
          onClick={() => setFWard("all")}
        >
          Ward: {fWard}
        </button>
      </div>
      <section className="dashboard-grid">
        <Section
          title="Capacity Risk"
          insight="Click ward bars to cross-filter every chart and table."
          kpi={{
            label: "Overloaded Wards",
            value: fCount(
              wards.filter((w) => w.bedDaysPerCapacity > 20).length,
            ),
          }}
          loading={loading.cube}
          error={errors.cube}
        >
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={wards.slice(0, topN)}>
                <CartesianGrid stroke="#d5dde7" strokeDasharray="3 3" />
                <XAxis dataKey="wardName" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip
                  formatter={(v) => [num(v).toFixed(2), "BedDays/Capacity"]}
                />
                <Bar
                  dataKey="bedDaysPerCapacity"
                  radius={[6, 6, 0, 0]}
                  onClick={(r) =>
                    setFWard((x) =>
                      x === String(r.wardId) ? "all" : String(r.wardId),
                    )
                  }
                >
                  {wards.slice(0, topN).map((w) => (
                    <Cell
                      key={w.wardName}
                      fill={fWard === String(w.wardId) ? C.readmit : C.cases}
                    />
                  ))}
                </Bar>
                <ReferenceLine
                  y={20}
                  stroke={C.readmit}
                  strokeDasharray="5 5"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section
          title="Clinical Outcomes"
          insight="Recovery vs readmission trend with target line."
          kpi={{
            label: "Recovery Rate",
            value: fPct(overview.recoveryRatePct),
          }}
          loading={loading.cube}
          error={errors.cube}
        >
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={270}>
              <LineChart data={trend}>
                <CartesianGrid stroke="#d5dde7" strokeDasharray="3 3" />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={(v) => `${Math.round(num(v))}%`}
                />
                <Tooltip
                  formatter={(v, k) => [
                    k === "avgReadmitPct" ? `${num(v).toFixed(1)}%` : fCount(v),
                    k === "avgReadmitPct" ? "Readmit Rate" : "Recovered",
                  ]}
                />
                <Line
                  yAxisId="left"
                  dataKey="recoveredCases"
                  stroke={C.recovery}
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  dataKey={(r) =>
                    (num(r.readmittedCases) / Math.max(num(r.totalCases), 1)) *
                    100
                  }
                  name="avgReadmitPct"
                  stroke={C.readmit}
                  strokeWidth={2.5}
                  dot={false}
                />
                <ReferenceLine
                  yAxisId="right"
                  y={12}
                  stroke={C.readmit}
                  strokeDasharray="5 5"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section
          title="Cost Pressure"
          insight="Average treatment cost against target budget."
          kpi={{ label: "Avg Cost", value: fCost(overview.avgTreatmentCost) }}
          loading={loading.cube}
          error={errors.cube}
        >
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={270}>
              <LineChart data={trend}>
                <CartesianGrid stroke="#d5dde7" strokeDasharray="3 3" />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={(v) => `$${Math.round(num(v) / 1000)}k`}
                />
                <Tooltip formatter={(v) => [fCost(v), "Average Cost"]} />
                <Line
                  dataKey="avgCost"
                  stroke={C.cost}
                  strokeWidth={2.5}
                  dot={false}
                />
                <ReferenceLine
                  y={13000}
                  stroke={C.neutral}
                  strokeDasharray="5 5"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </section>
      <section className="quality-panel">
        <div className="card-head">
          <h3>Data Freshness + Quality</h3>
          <TopN topN={topN} setTopN={setTopN} />
        </div>
        <Widget
          loading={loading.quality}
          error={errors.quality}
          minHeight={170}
        >
          <div className="quality-grid">
            <article>
              <p>Last loaded date</p>
              <strong>{fDate(quality?.lastFactDate)}</strong>
            </article>
            <article>
              <p>Fact rows</p>
              <strong>{fCount(quality?.factRows)}</strong>
            </article>
            <article>
              <p>Staleness</p>
              <strong>{fCount(quality?.stalenessDays)} days</strong>
            </article>
            <article>
              <p>Null ward rows</p>
              <strong>{fCount(quality?.nullWardRows)}</strong>
            </article>
          </div>
          {warnings.length ? (
            <div className="warning-row">
              {warnings.map((w) => (
                <span key={w} className="warning-chip">
                  {w}
                </span>
              ))}
            </div>
          ) : (
            <p className="healthy-note">No key-integrity warnings detected.</p>
          )}
        </Widget>
      </section>
      <section className="table-card">
        <div className="card-head">
          <h3>Top Disease Burden (click to filter)</h3>
        </div>
        <Widget loading={loading.cube} error={errors.cube} minHeight={220}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Disease</th>
                  <th>Cases</th>
                  <th>Readmissions</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {disease.slice(0, topN).map((r) => (
                  <tr
                    key={r.diseaseCode}
                    className={
                      fDisease === r.diseaseCode
                        ? "select-row active"
                        : "select-row"
                    }
                    onClick={() =>
                      setFDisease((x) =>
                        x === r.diseaseCode ? "all" : r.diseaseCode,
                      )
                    }
                  >
                    <td>{r.diseaseName}</td>
                    <td>{fCount(r.totalCases)}</td>
                    <td>{fCount(r.readmittedCases)}</td>
                    <td>{fPct(r.readmissionRatePct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Widget>
      </section>
    </div>
  );
}

function Patients({ loading, errors, patients, risk, fWard, setFWard }) {
  return (
    <div className="page-grid">
      <section className="page-header">
        <h2>Patient Monitoring</h2>
        <p>Alert table is filtered by global search + selected ward.</p>
      </section>
      <section className="two-col">
        <article className="narrative-card">
          <div className="card-head">
            <h3>Risk Distribution</h3>
            <p>Current trigger severity mix.</p>
          </div>
          <Widget
            loading={loading.alerts}
            error={errors.alerts}
            minHeight={250}
          >
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={risk}
                    dataKey="value"
                    innerRadius={52}
                    outerRadius={84}
                  >
                    {risk.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [fCount(v), "Alerts"]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Widget>
        </article>
        <section className="table-card">
          <div className="card-head">
            <h3>Active Patient Directory</h3>
            <button
              type="button"
              className="text-btn"
              onClick={() => setFWard("all")}
            >
              Clear ward ({fWard})
            </button>
          </div>
          <Widget
            loading={loading.alerts}
            error={errors.alerts}
            minHeight={250}
          >
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Condition</th>
                    <th>Days</th>
                    <th>Risk</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.length ? (
                    patients.map((p) => (
                      <tr key={`${p.id}-${p.date}`}>
                        <td>{p.id}</td>
                        <td>{p.condition}</td>
                        <td>{fCount(p.days)}</td>
                        <td>
                          <span
                            className={`risk-badge ${p.days >= 10 ? "critical" : p.days >= 7 ? "high-risk" : "stable"}`}
                          >
                            {p.days >= 10
                              ? "Critical"
                              : p.days >= 7
                                ? "High Risk"
                                : "Stable"}
                          </span>
                        </td>
                        <td>{p.date}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5}>No rows match current filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Widget>
        </section>
      </section>
    </div>
  );
}

function Facility({ topN, loading, errors, wards, fWard, setFWard }) {
  return (
    <div className="page-grid">
      <section className="page-header">
        <h2>Facility Utilization</h2>
        <p>Ward pressure with cross-filtering by bar click.</p>
      </section>
      <section className="narrative-card">
        <div className="card-head">
          <h3>Ward Pressure Ranking</h3>
          <p>Threshold at 20 bed-days per capacity.</p>
        </div>
        <Widget loading={loading.cube} error={errors.cube} minHeight={300}>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={wards.slice(0, topN)}>
                <CartesianGrid stroke="#d5dde7" strokeDasharray="3 3" />
                <XAxis dataKey="wardName" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip
                  formatter={(v) => [num(v).toFixed(2), "BedDays/Capacity"]}
                />
                <Bar
                  dataKey="bedDaysPerCapacity"
                  radius={[6, 6, 0, 0]}
                  onClick={(r) =>
                    setFWard((x) =>
                      x === String(r.wardId) ? "all" : String(r.wardId),
                    )
                  }
                >
                  {wards.slice(0, topN).map((w) => (
                    <Cell
                      key={w.wardName}
                      fill={fWard === String(w.wardId) ? C.readmit : C.cases}
                    />
                  ))}
                </Bar>
                <ReferenceLine
                  y={20}
                  stroke={C.readmit}
                  strokeDasharray="5 5"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Widget>
      </section>
    </div>
  );
}

function Analytics({
  topN,
  loading,
  errors,
  disease,
  doctors,
  fDisease,
  fDoctor,
  setFDisease,
  setFDoctor,
}) {
  return (
    <div className="page-grid">
      <section className="page-header">
        <h2>Performance Analytics</h2>
        <p>Click rows to cross-filter every section.</p>
      </section>
      <section className="two-col">
        <section className="table-card">
          <div className="card-head">
            <h3>Disease Burden</h3>
          </div>
          <Widget loading={loading.cube} error={errors.cube} minHeight={260}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Disease</th>
                    <th>Cases</th>
                    <th>Readmit %</th>
                  </tr>
                </thead>
                <tbody>
                  {disease.slice(0, topN).map((r) => (
                    <tr
                      key={r.diseaseCode}
                      className={
                        fDisease === r.diseaseCode
                          ? "select-row active"
                          : "select-row"
                      }
                      onClick={() =>
                        setFDisease((x) =>
                          x === r.diseaseCode ? "all" : r.diseaseCode,
                        )
                      }
                    >
                      <td>{r.diseaseName}</td>
                      <td>{fCount(r.totalCases)}</td>
                      <td>{fPct(r.readmissionRatePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Widget>
        </section>
        <section className="table-card">
          <div className="card-head">
            <h3>Doctor Ranking</h3>
          </div>
          <Widget loading={loading.cube} error={errors.cube} minHeight={260}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Doctor</th>
                    <th>Specialization</th>
                    <th>Cases</th>
                    <th>Recovery %</th>
                  </tr>
                </thead>
                <tbody>
                  {doctors.slice(0, topN).map((r) => (
                    <tr
                      key={r.doctorId}
                      className={
                        fDoctor === String(r.doctorId)
                          ? "select-row active"
                          : "select-row"
                      }
                      onClick={() =>
                        setFDoctor((x) =>
                          x === String(r.doctorId) ? "all" : String(r.doctorId),
                        )
                      }
                    >
                      <td>{r.doctorId}</td>
                      <td>{r.specialization}</td>
                      <td>{fCount(r.totalCases)}</td>
                      <td>{fPct(r.recoveryRatePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Widget>
        </section>
      </section>
    </div>
  );
}

function Readmission({ topN, loading, errors, disease }) {
  return (
    <div className="page-grid">
      <section className="page-header">
        <h2>Readmission Deep Dive</h2>
        <p>Target line at 12% for quick outlier detection.</p>
      </section>
      <section className="narrative-card">
        <div className="card-head">
          <h3>Readmission by Disease</h3>
          <p>Top-N toggle is shared globally.</p>
        </div>
        <Widget loading={loading.cube} error={errors.cube} minHeight={300}>
          <div className="chart-box">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={disease.slice(0, topN)}>
                <CartesianGrid stroke="#d5dde7" strokeDasharray="3 3" />
                <XAxis dataKey="diseaseCode" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `${Math.round(num(v))}%`} />
                <Tooltip
                  formatter={(v) => [
                    `${num(v).toFixed(1)}%`,
                    "Readmission Rate",
                  ]}
                />
                <Bar
                  dataKey="readmissionRatePct"
                  fill={C.readmit}
                  radius={[6, 6, 0, 0]}
                />
                <ReferenceLine
                  y={12}
                  stroke={C.neutral}
                  strokeDasharray="5 5"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Widget>
      </section>
    </div>
  );
}

function Tables({ tableInventory, tablesLoading, tablesError, search }) {
  const normalizedSearch = search.trim().toLowerCase();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  const handleDownloadDataset = async () => {
    try {
      setDownloading(true);
      setDownloadError("");

      const response = await fetch("/api/table-dataset.csv");
      if (!response.ok) {
        throw new Error(`download failed (${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const dateTag = new Date().toISOString().slice(0, 10);
      const header = response.headers.get("content-disposition") || "";
      const match = header.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] || `careops_dataset_${dateTag}.csv`;
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDownloadError(error.message || "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const visibleDatabases = useMemo(() => {
    const databases = tableInventory?.databases || [];
    return databases
      .map((database) => {
        const tables = database.tables.filter((table) => {
          if (!normalizedSearch) return true;

          const tableHit = table.tableName
            .toLowerCase()
            .includes(normalizedSearch);
          const columnHit = table.columns.some((column) =>
            column.columnName.toLowerCase().includes(normalizedSearch),
          );

          return tableHit || columnHit;
        });

        return {
          ...database,
          tables,
          tableCount: tables.length,
          totalRows: tables.reduce(
            (sum, table) => sum + num(table.rowCount),
            0,
          ),
        };
      })
      .filter((database) => database.tables.length > 0);
  }, [tableInventory, normalizedSearch]);

  const visibleSummary = useMemo(() => {
    return {
      totalDatabases: visibleDatabases.length,
      totalTables: visibleDatabases.reduce(
        (sum, database) => sum + database.tableCount,
        0,
      ),
      totalRows: visibleDatabases.reduce(
        (sum, database) => sum + database.totalRows,
        0,
      ),
    };
  }, [visibleDatabases]);

  return (
    <div className="page-grid">
      <section className="page-header">
        <h2>Table Inventory</h2>
        <p>
          Showing {fCount(visibleSummary.totalTables)} tables across{" "}
          {fCount(visibleSummary.totalDatabases)} databases (
          {fCount(visibleSummary.totalRows)} total rows).
        </p>
        <div className="tables-actions">
          <button
            type="button"
            className="download-btn"
            onClick={handleDownloadDataset}
            disabled={downloading || tablesLoading}
          >
            {downloading ? "Preparing..." : "Download Dataset (CSV)"}
          </button>
          {downloadError ? (
            <span className="download-error">{downloadError}</span>
          ) : null}
        </div>
      </section>

      <Widget loading={tablesLoading} error={tablesError} minHeight={320}>
        {visibleDatabases.length ? (
          <section className="table-catalog-grid">
            {visibleDatabases.map((database) => (
              <article className="table-card" key={database.databaseName}>
                <div className="card-head">
                  <div>
                    <h3>{database.label}</h3>
                    <p>{database.databaseName}</p>
                  </div>
                  <p>
                    {fCount(database.tableCount)} tables |{" "}
                    {fCount(database.totalRows)} rows
                  </p>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Table</th>
                        <th>Rows</th>
                        <th>Columns</th>
                      </tr>
                    </thead>
                    <tbody>
                      {database.tables.map((table) => (
                        <tr key={`${database.databaseName}-${table.tableName}`}>
                          <td>{table.tableName}</td>
                          <td>{fCount(table.rowCount)}</td>
                          <td>
                            <details className="column-details">
                              <summary>
                                {fCount(table.columnCount)} columns
                              </summary>
                              <div className="column-chip-row">
                                {table.columns.map((column) => (
                                  <span
                                    key={`${table.tableName}-${column.columnName}`}
                                    className="column-chip"
                                  >
                                    {column.columnName}
                                  </span>
                                ))}
                              </div>
                            </details>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="table-card">
            <div className="card-head">
              <h3>No matching tables</h3>
            </div>
            <p className="healthy-note">
              No table name or column matches the current search text.
            </p>
          </section>
        )}
      </Widget>
    </div>
  );
}

export default App;
