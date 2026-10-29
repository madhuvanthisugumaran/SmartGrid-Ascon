
import { useEffect, useState } from "react";
import {
  Activity, ShieldCheck, Gauge, Zap, AlertTriangle,
  Server, LayoutDashboard, Radio, FileText, LogOut,
  Plus, RefreshCw, Play, LockKeyhole, CheckCircle2,
  XCircle, Menu
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, CartesianGrid,
  XAxis, YAxis, Tooltip
} from "recharts";
import "./App.css";

const API = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
export default function App() {
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [page, setPage] = useState("Dashboard");
  const [meters, setMeters] = useState([]);
  const [summary, setSummary] = useState({});
  const [logs, setLogs] = useState([]);
  const [meterId, setMeterId] = useState("M-001");
  const [meterName, setMeterName] = useState("");
  const [location, setLocation] = useState("College Lab");
  const [kwh, setKwh] = useState("245");
  const [voltage, setVoltage] = useState("230");
  const [current, setCurrent] = useState("5");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sidebar, setSidebar] = useState(true);

  async function api(path, options = {}) {
    const response = await fetch(API + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
    return data;
  }

  async function login(e) {
    e.preventDefault();
    setError("");
    try {
      const response = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Login failed");
      setToken(data.token);
      setPassword("");
    } catch (e) {
      setError(e.message);
    }
  }

  async function refresh() {
    try {
      const [s, m, l] = await Promise.all([
        api("/api/dashboard/summary"),
        api("/api/meters"),
        api("/api/logs")
      ]);
      setSummary(s);
      setMeters(m);
      setLogs(l);
      if (m.length && !m.some(x => x.meter_id === meterId))
        setMeterId(m[0].meter_id);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    if (token) refresh();
  }, [token]);

  async function runAction(fn) {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const data = await fn();
      setResult(data);
      await refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addMeter(e) {
    e.preventDefault();
    await runAction(() => api("/api/meters", {
      method: "POST",
      body: JSON.stringify({
        meter_id: meterId,
        name: meterName,
        location
      })
    }));
    setMeterName("");
  }

  function authenticate() {
    return runAction(() => api("/api/protocol/authenticate", {
      method: "POST",
      body: JSON.stringify({
        meter_id: meterId,
        cm: crypto.getRandomValues(new Uint8Array(16))
          .reduce((s, b) => s + b.toString(16).padStart(2, "0"), "")
      })
    }));
  }

  function transmit() {
    if (!result?.session_id) {
      setError("Authenticate the selected meter first.");
      return;
    }
    return runAction(() => api("/api/readings/transmit", {
      method: "POST",
      body: JSON.stringify({
        meter_id: meterId,
        session_id: result.session_id,
        kwh: Number(kwh),
        voltage: Number(voltage),
        current: Number(current)
      })
    }));
  }

  async function simulate(type) {
    return runAction(() => api(`/api/simulation/${type}`, {
      method: "POST",
      body: JSON.stringify({ meter_id: meterId })
    }));
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {}
    setToken("");
    setResult(null);
    setPage("Dashboard");
  }

  const nav = [
    ["Dashboard", LayoutDashboard],
    ["Smart Meters", Gauge],
    ["Authentication", ShieldCheck],
    ["Transmission", Zap],
    ["Attack Simulator", AlertTriangle],
    ["Security Logs", FileText]
  ];

  const cards = [
    ["Registered meters", summary.meters ?? 0, Gauge, "blue"],
    ["Successful authentications", summary.auth_ok ?? 0, ShieldCheck, "green"],
    ["Failed authentications", summary.auth_failed ?? 0, LockKeyhole, "amber"],
    ["Rejected security events", summary.rejected ?? 0, AlertTriangle, "red"]
  ];

  if (!token) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="brand-icon"><ShieldCheck size={32}/></div>
          <p className="eyebrow">IoE SECURITY PLATFORM</p>
          <h1>SmartGrid<span>Secure</span></h1>
          <p className="muted">Smart meter mutual authentication and monitoring</p>
          <form onSubmit={login}>
            <label>Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} required/>
            <label>Password</label>
            <input type="password" value={password}
              onChange={e => setPassword(e.target.value)} required/>
            {error && <p className="error">{error}</p>}
            <button className="primary full" type="submit">Sign in securely <LockKeyhole size={16}/></button>
          </form>
          <p className="footnote">Academic prototype · Local environment</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {sidebar && <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><Zap size={23}/></div>
          <div><strong>SmartGrid</strong><small>SECURITY CENTER</small></div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        {nav.map(([name, Icon]) => (
          <button key={name} onClick={() => { setPage(name); setResult(null); setError(""); }}
            className={`nav-item ${page === name ? "active" : ""}`}>
            <Icon size={18}/><span>{name}</span>
          </button>
        ))}
        <div className="sidebar-bottom">
          <div className="online-dot"/> Backend session active
          <button className="nav-item logout" onClick={logout}><LogOut size={18}/> Sign out</button>
        </div>
      </aside>}

      <main className="main">
        <header className="topbar">
          <button className="icon-button" onClick={() => setSidebar(!sidebar)}><Menu/></button>
          <div><span className="muted">Workspace / </span><strong>{page}</strong></div>
          <div className="top-right"><span className="status-pill"><i/> API connected</span>
            <button className="icon-button" onClick={refresh}><RefreshCw size={17}/></button>
          </div>
        </header>

        <div className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">SMART GRID · SECURITY OPERATIONS</p>
              <h1>{page}</h1>
              <p className="muted">Monitor connected meters and verify protected communications.</p>
            </div>
          </div>

          {error && <div className="alert error"><XCircle size={18}/>{error}
            <button onClick={() => setError("")}>Dismiss</button></div>}

          {page === "Dashboard" && <>
            <div className="cards">
              {cards.map(([label, value, Icon, color]) => (
                <div className="stat-card" key={label}>
                  <div className={`stat-icon ${color}`}><Icon size={21}/></div>
                  <p>{label}</p><h2>{value}</h2>
                  <small>Live backend data</small>
                </div>
              ))}
            </div>
            <div className="two-col">
              <section className="panel">
                <div className="panel-title"><div><h3>System overview</h3>
                  <p className="muted">Current prototype status</p></div><Activity/></div>
                <div className="overview-row"><span>Backend API</span><b className="green-text">Connected</b></div>
                <div className="overview-row"><span>Data source</span><b>Simulated meters</b></div>
                <div className="overview-row"><span>Crypto library</span><b>Ascon-128a v1.2</b></div>
                <div className="overview-row"><span>Accepted readings</span><b>{summary.readings ?? 0}</b></div>
                <p className="notice">Academic prototype: this implementation is not the NIST SP 800-232 Ascon-AEAD128 variant.</p>
              </section>
              <section className="panel">
                <div className="panel-title"><div><h3>Recent security events</h3>
                  <p className="muted">Latest backend audit records</p></div><FileText/></div>
                {logs.slice(0, 6).map((log, i) => (
                  <div className="event-row" key={log.id ?? i}>
                    <span className={`event-dot ${log.result === "success" ? "ok" : "bad"}`}/>
                    <div><b>{log.type}</b><small>{log.descr}</small></div>
                    <small>{new Date(log.ts * 1000).toLocaleTimeString()}</small>
                  </div>
                ))}
                {!logs.length && <p className="muted">No events recorded yet.</p>}
              </section>
            </div>
          </>}

          {page === "Smart Meters" && <>
            <section className="panel">
              <h3>Register a smart meter</h3>
              <form className="form-grid" onSubmit={addMeter}>
                <div><label>Meter ID</label><input value={meterId} onChange={e => setMeterId(e.target.value)} required/></div>
                <div><label>Meter name</label><input value={meterName} onChange={e => setMeterName(e.target.value)} placeholder="Block A meter" required/></div>
                <div><label>Location</label><input value={location} onChange={e => setLocation(e.target.value)}/></div>
                <button className="primary" disabled={busy}><Plus size={16}/> Register meter</button>
              </form>
            </section>
            <section className="panel">
              <div className="panel-title"><h3>Registered meters</h3><span>{meters.length} total</span></div>
              <div className="table-wrap"><table><thead><tr><th>Meter ID</th><th>Name</th><th>Location</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>{meters.map(m => <tr key={m.meter_id}>
                  <td>{m.meter_id}</td><td>{m.name}</td><td>{m.location || "—"}</td>
                  <td><span className="status-pill"><i/>{m.enabled ? "Registered" : "Disabled"}</span></td>
                  <td><button className="secondary small" onClick={() => setMeterId(m.meter_id)}>Select</button></td>
                </tr>)}</tbody></table></div>
            </section>
          </>}

          {page === "Authentication" && <section className="panel action-panel">
            <div className="large-icon"><ShieldCheck size={30}/></div>
            <h2>Mutual authentication</h2>
            <p className="muted">Verify the selected simulated meter and server using the backend challenge-response protocol.</p>
            <label>Choose smart meter</label>
            <select value={meterId} onChange={e => {setMeterId(e.target.value); setResult(null);}}>
              {meters.map(m => <option key={m.meter_id} value={m.meter_id}>{m.meter_id} — {m.name}</option>)}
            </select>
            <button className="primary" disabled={busy || !meters.length} onClick={authenticate}><Play size={17}/> Start authentication</button>
            {result && <pre className="result-box">{JSON.stringify(result, null, 2)}</pre>}
          </section>}

          {page === "Transmission" && <section className="panel action-panel">
            <div className="large-icon"><Zap size={30}/></div><h2>Secure electricity transmission</h2>
            <p className="muted">Authenticate a meter, then send a protected reading.</p>
            <label>Selected meter</label>
            <select value={meterId} onChange={e => {setMeterId(e.target.value); setResult(null);}}>
              {meters.map(m => <option key={m.meter_id} value={m.meter_id}>{m.meter_id} — {m.name}</option>)}
            </select>
            <button className="secondary" disabled={busy || !meters.length} onClick={authenticate}>1. Authenticate meter</button>
            {result?.session_id && <p className="success-message"><CheckCircle2 size={17}/> Session: {result.session_id}</p>}
            <div className="form-grid">
              <div><label>Energy (kWh)</label><input type="number" min="0" value={kwh} onChange={e => setKwh(e.target.value)}/></div>
              <div><label>Voltage (V)</label><input type="number" min="0" value={voltage} onChange={e => setVoltage(e.target.value)}/></div>
              <div><label>Current (A)</label><input type="number" min="0" value={current} onChange={e => setCurrent(e.target.value)}/></div>
            </div>
            <button className="primary" disabled={busy || !result?.session_id} onClick={transmit}><LockKeyhole size={17}/> 2. Encrypt and transmit</button>
            {result && <pre className="result-box">{JSON.stringify(result, null, 2)}</pre>}
          </section>}

          {page === "Attack Simulator" && <section className="panel">
            <h2>Security test lab</h2>
            <p className="muted">Run controlled tests against your local backend. Select a registered meter for meter-specific tests.</p>
            <label>Test meter</label>
            <select value={meterId} onChange={e => setMeterId(e.target.value)}>
              {meters.map(m => <option key={m.meter_id} value={m.meter_id}>{m.meter_id} — {m.name}</option>)}
            </select>
            <div className="test-grid">
              {[
                ["tamper", "Message tampering", "Modify a protected message"],
                ["replay", "Replay attempt", "Resubmit a previously accepted message"],
                ["unknown-meter", "Unknown meter", "Attempt access with an unregistered meter"],
                ["invalid-response", "Invalid response", "Send an incorrect challenge response"],
                ["expired-challenge", "Expired challenge", "Submit an expired challenge response"]
              ].map(([id, name, desc]) => (
                <div className="test-card" key={id}><AlertTriangle size={20}/><h3>{name}</h3><p>{desc}</p>
                  <button className="secondary" disabled={busy || (id !== "unknown-meter" && !meters.length)} onClick={() => simulate(id)}>Run test <Play size={14}/></button>
                </div>
              ))}
            </div>
            {result && <pre className="result-box">{JSON.stringify(result, null, 2)}</pre>}
          </section>}

          {page === "Security Logs" && <section className="panel">
            <div className="panel-title"><h3>Audit trail</h3><button className="secondary" onClick={refresh}><RefreshCw size={15}/> Refresh logs</button></div>
            <div className="table-wrap"><table><thead><tr><th>Time</th><th>Meter</th><th>Event</th><th>Description</th><th>Result</th><th>Severity</th></tr></thead>
              <tbody>{logs.map((l, i) => <tr key={l.id ?? i}>
                <td>{new Date(l.ts * 1000).toLocaleString()}</td><td>{l.meter_id || "—"}</td><td>{l.type}</td><td>{l.descr}</td><td>{l.result}</td><td>{l.severity}</td>
              </tr>)}</tbody></table></div>
          </section>}

          {result && <div className="result-toast"><CheckCircle2 size={17}/> Backend response received</div>}
          <footer>SmartGrid Secure · IoE academic prototype · Simulated device data</footer>
        </div>
      </main>
    </div>
  );
}
