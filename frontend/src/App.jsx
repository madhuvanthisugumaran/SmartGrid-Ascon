import { useEffect, useMemo, useState } from "react";
import "./App.css";

const initialMeters = [
  { id: "M-001", name: "Main Building Meter", location: "Block A", status: "Connected" },
  { id: "M-002", name: "Laboratory Meter", location: "Block B", status: "Connected" },
  { id: "M-003", name: "Hostel Meter", location: "Hostel", status: "Disconnected" },
];

const initialLogs = [
  { id: 1, time: new Date().toISOString(), meter: "M-001", event: "System initialized", result: "Success", severity: "Info" },
  { id: 2, time: new Date().toISOString(), meter: "M-002", event: "Smart meter connected", result: "Success", severity: "Info" },
];

const initialReadings = [
  { id: 1, meter: "M-001", voltage: 230, current: 5, energy: 2.45, power: 1150, time: new Date().toISOString(), status: "Verified" },
  { id: 2, meter: "M-002", voltage: 228, current: 4.2, energy: 1.85, power: 957.6, time: new Date().toISOString(), status: "Verified" },
];

const initialStats = {
  authentication: 98,
  transmitted: 245,
  rejected: 7,
};

const navigation = [
  { id: "dashboard", label: "Dashboard", icon: "▦" },
  { id: "meters", label: "Smart Meters", icon: "▤" },
  { id: "authentication", label: "Authentication", icon: "◈" },
  { id: "transmission", label: "Data Transmission", icon: "⇧" },
  { id: "attacks", label: "Attack Simulator", icon: "⚠" },
  { id: "logs", label: "Security Logs", icon: "☷" },
];

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function App() {
  const [page, setPage] = useState("dashboard");

  const [meters, setMeters] = useState(() =>
    readStorage("sg_meters", initialMeters)
  );

  const [readings, setReadings] = useState(() =>
    readStorage("sg_readings", initialReadings)
  );

  const [logs, setLogs] = useState(() =>
    readStorage("sg_logs", initialLogs)
  );

  const [stats, setStats] = useState(() =>
    readStorage("sg_stats", initialStats)
  );

  const [selectedMeter, setSelectedMeter] = useState("M-001");

  const [meterForm, setMeterForm] = useState({
    id: "",
    name: "",
    location: "",
  });

  const [readingForm, setReadingForm] = useState({
    voltage: "230",
    current: "5",
    energy: "2.45",
  });

  const [authStatus, setAuthStatus] = useState("Not started");
  const [authProgress, setAuthProgress] = useState(0);
  const [authSession, setAuthSession] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [transmissionStatus, setTransmissionStatus] = useState("Waiting");
  const [transmissionBusy, setTransmissionBusy] = useState(false);

  const [attackResult, setAttackResult] = useState(null);
  const [attackBusy, setAttackBusy] = useState(false);

  const [notification, setNotification] = useState("");
  const [filter, setFilter] = useState("All");

  const [mobileMenu, setMobileMenu] = useState(false);

  // Save the data in the browser.
  useEffect(() => {
    localStorage.setItem("sg_meters", JSON.stringify(meters));
  }, [meters]);

  useEffect(() => {
    localStorage.setItem("sg_readings", JSON.stringify(readings));
  }, [readings]);

  useEffect(() => {
    localStorage.setItem("sg_logs", JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem("sg_stats", JSON.stringify(stats));
  }, [stats]);

  // Add a new security log.
  function addLog(event, result = "Success", severity = "Info", meter = selectedMeter) {
    const item = {
      id: Date.now() + Math.random(),
      time: new Date().toISOString(),
      meter,
      event,
      result,
      severity,
    };

    setLogs((old) => [item, ...old].slice(0, 200));
  }

  function notify(message) {
    setNotification(message);
    window.setTimeout(() => setNotification(""), 3000);
  }

  const connectedMeters = meters.filter(
    (meter) => meter.status === "Connected"
  );

  const selectedMeterInfo = meters.find(
    (meter) => meter.id === selectedMeter
  );

  const latestReading = readings[0];

  const totalEnergy = useMemo(
    () => readings.reduce((sum, item) => sum + Number(item.energy || 0), 0),
    [readings]
  );

  const filteredLogs = logs.filter((item) => {
    if (filter === "All") return true;
    return item.severity === filter;
  });

  function changePage(id) {
    setPage(id);
    setMobileMenu(false);
    setNotification("");
  }

  // Register a meter.
  function addMeter(event) {
    event.preventDefault();

    const id = meterForm.id.trim().toUpperCase();

    if (!id || !meterForm.name.trim()) {
      notify("Enter a meter ID and name.");
      return;
    }

    if (meters.some((meter) => meter.id === id)) {
      notify("This meter ID already exists.");
      return;
    }

    const newMeter = {
      id,
      name: meterForm.name.trim(),
      location: meterForm.location.trim() || "Not specified",
      status: "Connected",
    };

    setMeters((old) => [...old, newMeter]);
    setSelectedMeter(id);
    setMeterForm({ id: "", name: "", location: "" });

    addLog("New smart meter registered", "Success", "Info", id);
    notify("Smart meter registered successfully.");
  }

  function toggleMeter(id) {
    const meter = meters.find((item) => item.id === id);
    if (!meter) return;

    const nextStatus =
      meter.status === "Connected" ? "Disconnected" : "Connected";

    setMeters((old) =>
      old.map((item) =>
        item.id === id ? { ...item, status: nextStatus } : item
      )
    );

    addLog(
      `Meter ${nextStatus.toLowerCase()}`,
      "Success",
      "Info",
      id
    );

    notify(`${id} ${nextStatus.toLowerCase()}.`);
  }

  // Simulate the mutual authentication workflow.
  function authenticateMeter() {
    if (!selectedMeterInfo) {
      notify("Select a registered meter first.");
      return;
    }

    if (selectedMeterInfo.status !== "Connected") {
      setAuthStatus("Failed");
      notify("The selected meter is disconnected.");
      addLog("Authentication failed: meter disconnected", "Rejected", "High");
      return;
    }

    setAuthBusy(true);
    setAuthProgress(0);
    setAuthStatus("Starting...");
    setAuthSession("");

    const stages = [
      "Generating server challenge...",
      "Receiving meter response...",
      "Checking response...",
      "Generating session key...",
      "Authentication successful",
    ];

    let step = 0;

    setAuthStatus(stages[0]);

    const interval = window.setInterval(() => {
      step += 1;
      setAuthProgress(step * 20);
      setAuthStatus(stages[Math.min(step, stages.length - 1)]);

      if (step >= stages.length - 1) {
        window.clearInterval(interval);

        const session = "SG-" + Math.random().toString(16).slice(2, 10).toUpperCase();

        setAuthSession(session);
        setAuthStatus("Authenticated");
        setAuthBusy(false);

        setStats((old) => ({
          ...old,
          authentication: old.authentication + 1,
        }));

        addLog("Mutual authentication completed", "Success", "Info");
        notify("Authentication completed.");
      }
    }, 650);
  }

  // Simulate protected data transmission.
  function transmitReading(event) {
    event.preventDefault();

    if (!selectedMeterInfo) {
      notify("Select a meter first.");
      return;
    }

    if (selectedMeterInfo.status !== "Connected") {
      notify("Connect the meter before transmitting.");
      setTransmissionStatus("Failed");
      return;
    }

    if (!authSession) {
      notify("Complete authentication first.");
      return;
    }

    const voltage = Number(readingForm.voltage);
    const current = Number(readingForm.current);
    const energy = Number(readingForm.energy);

    if (
      !Number.isFinite(voltage) ||
      !Number.isFinite(current) ||
      !Number.isFinite(energy) ||
      voltage <= 0 ||
      current < 0 ||
      energy < 0
    ) {
      notify("Enter valid positive reading values.");
      return;
    }

    setTransmissionBusy(true);
    setTransmissionStatus("Preparing encrypted payload...");

    window.setTimeout(() => {
      setTransmissionStatus("Transmitting data...");

      window.setTimeout(() => {
        const newReading = {
          id: Date.now(),
          meter: selectedMeter,
          voltage,
          current,
          energy,
          power: Number((voltage * current).toFixed(2)),
          time: new Date().toISOString(),
          status: "Verified",
        };

        setReadings((old) => [newReading, ...old].slice(0, 100));

        setStats((old) => ({
          ...old,
          transmitted: old.transmitted + 1,
        }));

        setTransmissionStatus("Transmission successful");
        setTransmissionBusy(false);

        addLog("Encrypted data transmission completed", "Success", "Info");
        addLog("Server verification completed", "Success", "Info");

        notify("Reading transmitted successfully.");
      }, 900);
    }, 900);
  }

  // Simulate different security tests.
  function runAttack(type) {
    if (attackBusy) return;

    setAttackBusy(true);
    setAttackResult(null);

    const tests = {
      tampering: {
        title: "Message Tampering",
        description: "A modified message is submitted to the verification process.",
        action: "Modified message detected",
        result: "Rejected",
        severity: "High",
      },
      replay: {
        title: "Replay Attack",
        description: "A previously used message is submitted again.",
        action: "Repeated sequence number detected",
        result: "Rejected",
        severity: "High",
      },
      unknown: {
        title: "Unknown Meter",
        description: "An unregistered meter attempts to communicate.",
        action: "Unknown meter ID detected",
        result: "Rejected",
        severity: "High",
      },
      invalid: {
        title: "Invalid Authentication",
        description: "An incorrect challenge response is submitted.",
        action: "Response mismatch detected",
        result: "Rejected",
        severity: "High",
      },
      expired: {
        title: "Expired Challenge",
        description: "A response arrives after the allowed challenge time.",
        action: "Challenge timeout detected",
        result: "Rejected",
        severity: "Medium",
      },
    };
    const test = tests[type];

    if (!test) {
      setAttackBusy(false);
      return;
    }

    window.setTimeout(() => {
      setAttackResult(test);
      setStats((old) => ({
        ...old,
        rejected: old.rejected + 1,
      }));

      addLog(
        `Security test: ${test.title}`,
        test.result,
        test.severity
      );

      setAttackBusy(false);
      notify(`${test.title}: request rejected.`);
    }, 1200);
  }

  function resetSystem() {
    const confirmed = window.confirm(
      "Reset all meters, readings and logs?"
    );

    if (!confirmed) return;

    setMeters(initialMeters);
    setReadings(initialReadings);
    setLogs(initialLogs);
    setStats(initialStats);

    setSelectedMeter("M-001");
    setAuthStatus("Not started");
    setAuthProgress(0);
    setAuthSession("");
    setTransmissionStatus("Waiting");
    setAttackResult(null);

    localStorage.removeItem("sg_meters");
    localStorage.removeItem("sg_readings");
    localStorage.removeItem("sg_logs");
    localStorage.removeItem("sg_stats");

    notify("System data reset.");
  }

  function downloadLogs() {
    const csv = [
      ["Time", "Meter", "Event", "Result", "Severity"],
      ...logs.map((item) => [
        item.time,
        item.meter,
        item.event,
        item.result,
        item.severity,
      ]),
    ]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = "smartgrid-security-logs.csv";
    anchor.click();

    URL.revokeObjectURL(url);
    notify("Security logs exported.");
  }

  function renderDashboard() {
    return (
      <>
        <div className="page-heading">
          <div>
            <div className="eyebrow">SECURITY OPERATIONS / OVERVIEW</div>
            <h1>Smart Grid Dashboard</h1>
            <p>Monitor smart meters, communication and security events.</p>
          </div>

          <button className="button button-outline" onClick={resetSystem}>
            ↻ Reset System
          </button>
        </div>

        <div className="stat-grid">
          <StatCard title="Registered Meters" value={meters.length} icon="▤" color="blue" note={`${connectedMeters.length} currently connected`} />
          <StatCard title="Successful Authentication" value={stats.authentication} icon="◈" color="green" note="Successful sessions" />
          <StatCard title="Messages Transmitted" value={stats.transmitted} icon="⇧" color="purple" note="Data transmissions" />
          <StatCard title="Rejected Security Tests" value={stats.rejected} icon="⚠" color="orange" note="Rejected security tests" />
        </div>

        <div className="dashboard-grid">
          <section className="panel">
            <PanelTitle title="Latest Smart Meter Reading" subtitle="Most recent data received" />

            {latestReading ? (
              <>
                <div className="reading-highlight">
                  <div>
                    <span className="muted-label">ENERGY CONSUMPTION</span>
                    <div className="energy-value">{latestReading.energy} <small>kWh</small></div>
                  </div>
                  <span className="status status-green">● {latestReading.status}</span>
                </div>

                <div className="reading-grid">
                  <Metric label="Voltage" value={`${latestReading.voltage} V`} />
                  <Metric label="Current" value={`${latestReading.current} A`} />
                  <Metric label="Power" value={`${latestReading.power} W`} />
                  <Metric label="Meter ID" value={latestReading.meter} />
                </div>
              </>
            ) : (
              <EmptyState text="No readings available. Transmit a reading first." />
            )}
          </section>

          <section className="panel">
            <PanelTitle title="System Status" subtitle="System monitoring and operation status" />

            <StatusRow label="Application" value="Online" good />
            <StatusRow label="Smart meter network" value={`${connectedMeters.length} connected`} good={connectedMeters.length > 0} />
            <StatusRow label="Authentication module" value="Ready" good />
            <StatusRow label="Encryption workflow" value="Ready" good />
            <StatusRow label="Server verification" value="Ready" good />

            <div className="demo-notice">
              <strong>SYSTEM STATUS</strong>
              <span>Security workflow status and activity are displayed here.</span>
            </div>
          </section>
        </div>

        <section className="panel">
          <PanelTitle title="Smart Grid Communication" subtitle="Latest readings received from smart meters" />

          <ReadingTable readings={readings.slice(0, 6)} />
        </section>

        <section className="panel">
          <PanelTitle title="Recent Security Activity" subtitle="Latest recorded system events" />

          <LogTable logs={logs.slice(0, 5)} />
        </section>
      </>
    );
  }

  function renderMeters() {
    return (
      <>
        <PageHeading title="Smart Meters" subtitle="Register and manage smart meters." />

        <div className="dashboard-grid">
          <section className="panel">
            <PanelTitle title="Register New Meter" subtitle="Add a meter to the network" />

            <form onSubmit={addMeter} className="form-stack">
              <FormField label="Meter ID">
                <input
                  value={meterForm.id}
                  onChange={(e) => setMeterForm({ ...meterForm, id: e.target.value })}
                  placeholder="Example: M-004"
                  required
                />
              </FormField>

              <FormField label="Meter Name">
                <input
                  value={meterForm.name}
                  onChange={(e) => setMeterForm({ ...meterForm, name: e.target.value })}
                  placeholder="Enter meter name"
                  required
                />
              </FormField>

              <FormField label="Location">
                <input
                  value={meterForm.location}
                  onChange={(e) => setMeterForm({ ...meterForm, location: e.target.value })}
                  placeholder="Enter location"
                />
              </FormField>

              <button className="button button-primary" type="submit">
                + Register Meter
              </button>
            </form>
          </section>

          <section className="panel">
            <PanelTitle title="Network Summary" subtitle="Meter connection status" />

            <div className="big-number">{connectedMeters.length}/{meters.length}</div>
            <p className="muted-label">METERS CONNECTED</p>

            <div className="meter-progress">
              <div style={{ width: `${meters.length ? (connectedMeters.length / meters.length) * 100 : 0}%` }} />
            </div>

            <StatusRow label="Connected" value={connectedMeters.length} good />
            <StatusRow label="Disconnected" value={meters.length - connectedMeters.length} good={false} />
          </section>
        </div>

        <section className="panel">
          <PanelTitle title="Registered Smart Meters" subtitle={`${meters.length} registered meters`} />

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Meter ID</th>
                  <th>Meter Name</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {meters.map((meter) => (
                  <tr key={meter.id}>
                    <td><strong>{meter.id}</strong></td>
                    <td>{meter.name}</td>
                    <td>{meter.location}</td>
                    <td><span className={`status ${meter.status === "Connected" ? "status-green" : "status-gray"}`}>{meter.status}</span></td>
                    <td>
                      <button className="button button-small button-outline" onClick={() => toggleMeter(meter.id)}>
                        {meter.status === "Connected" ? "Disconnect" : "Connect"}
                      </button>
                      <button className="button button-small button-ghost" onClick={() => setSelectedMeter(meter.id)}>
                        Select
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </>
    );
  }

  function renderAuthentication() {
    return (
      <>
        <PageHeading title="Mutual Authentication" subtitle="Meter-server challenge-response workflow." />

        <div className="dashboard-grid">
          <section className="panel">
            <PanelTitle title="Authentication Control" subtitle="Select a meter and start authentication" />

            <FormField label="Select Smart Meter">
              <select value={selectedMeter} onChange={(e) => {
                setSelectedMeter(e.target.value);
                setAuthSession("");
                setAuthStatus("Not started");
              }}>
                {meters.map((meter) => (
                  <option key={meter.id} value={meter.id}>{meter.id} — {meter.name}</option>
                ))}
              </select>
            </FormField>

            <div className="selected-meter">
              <span className="selected-meter-icon">▤</span>
              <div>
                <strong>{selectedMeterInfo?.name || "No meter selected"}</strong>
                <small>{selectedMeterInfo?.location || "—"} · {selectedMeterInfo?.status || "Unavailable"}</small>
              </div>
            </div>

            <button className="button button-primary button-full" onClick={authenticateMeter} disabled={authBusy || !selectedMeterInfo}>
              {authBusy ? "Authenticating..." : "◈ Start Authentication"}
            </button>
          </section>

          <section className="panel">
            <PanelTitle title="Authentication Result" subtitle="Protocol execution status" />

            <div className="auth-result-icon">{authSession ? "✓" : "◈"}</div>

            <h3 className="center-text">{authStatus}</h3>

            <p className="muted center-text">
              {authSession
                ? "The authentication sequence has completed."
                : "Start authentication to see the process."}
            </p>

            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${authProgress}%` }} />
            </div>

            <div className="progress-caption">
              <span>Progress</span>
              <strong>{authProgress}%</strong>
            </div>

            {authSession && (
              <div className="session-box">
                <span className="muted-label">SESSION ID</span>
                <strong>{authSession}</strong>
              </div>
            )}

            <div className="demo-notice">
              <strong>AUTHENTICATION STATUS</strong>
              <span>Authentication workflow status.</span>
            </div>
          </section>
        </div>

        <section className="panel">
          <PanelTitle title="Authentication Workflow" subtitle="Illustrative protocol sequence" />

          <div className="workflow-grid">
            {[
              ["01", "Challenge Generation", "Server generates a challenge."],
              ["02", "Meter Response", "Meter provides a response."],
              ["03", "Response Verification", "The response is checked."],
              ["04", "Session Establishment", "An authenticated session is created."],
            ].map(([number, title, description], index) => (
              <div className="workflow-card" key={number}>
                <span className="workflow-number">{number}</span>
                <h4>{title}</h4>
                <p>{description}</p>
                <span className={`workflow-state ${authProgress >= (index + 1) * 20 ? "completed" : ""}`}>
                  {authProgress >= (index + 1) * 20 ? "✓ Completed" : "Waiting"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </>
    );
  }
  function renderTransmission() {
    return (
      <>
        <PageHeading title="Data Transmission" subtitle="Submit readings through the protected meter-to-server workflow." />

        <div className="dashboard-grid">
          <section className="panel">
            <PanelTitle title="Smart Meter Input" subtitle="Enter electricity readings" />

            <form className="form-stack" onSubmit={transmitReading}>
              <FormField label="Select Meter">
                <select value={selectedMeter} onChange={(e) => {
                  setSelectedMeter(e.target.value);
                  setAuthSession("");
                }}>
                  {meters.map((meter) => (
                    <option key={meter.id} value={meter.id}>{meter.id} — {meter.name}</option>
                  ))}
                </select>
              </FormField>

              <FormField label="Voltage (V)">
                <input type="number" min="1" step="any" value={readingForm.voltage} onChange={(e) => setReadingForm({ ...readingForm, voltage: e.target.value })} required />
              </FormField>

              <FormField label="Current (A)">
                <input type="number" min="0" step="any" value={readingForm.current} onChange={(e) => setReadingForm({ ...readingForm, current: e.target.value })} required />
              </FormField>

              <FormField label="Energy Consumption (kWh)">
                <input type="number" min="0" step="any" value={readingForm.energy} onChange={(e) => setReadingForm({ ...readingForm, energy: e.target.value })} required />
              </FormField>

              <div className="inline-info">
                <span>Authentication session</span>
                <strong>{authSession || "Not established"}</strong>
              </div>

              <button className="button button-primary button-full" disabled={transmissionBusy || !authSession || !selectedMeterInfo || selectedMeterInfo.status !== "Connected"}>
                {transmissionBusy ? "Processing..." : "⇧ Encrypt & Transmit"}
              </button>

              {!authSession && (
                <p className="field-hint">Complete authentication before transmitting.</p>
              )}
            </form>
          </section>

          <section className="panel">
            <PanelTitle title="Transmission Process" subtitle="Illustrative data transfer stages" />

            <div className="transmission-stage">
              <span className="stage-icon">▤</span>
              <div><strong>Smart Meter</strong><small>Reading generated</small></div>
              <span className="stage-tag">Input</span>
            </div>

            <div className="stage-line" />

            <div className="transmission-stage">
              <span className="stage-icon">◈</span>
              <div><strong>Ascon Encryption</strong><small>Encryption process</small></div>
              <span className="stage-tag">Process</span>
            </div>

            <div className="stage-line" />

            <div className="transmission-stage">
              <span className="stage-icon">⇧</span>
              <div><strong>Server Transmission</strong><small>Payload transfer</small></div>
              <span className="stage-tag">Transfer</span>
            </div>

            <div className="stage-line" />

            <div className="transmission-stage">
              <span className="stage-icon">✓</span>
              <div><strong>Server Verification</strong><small>Verification result</small></div>
              <span className="stage-tag">Output</span>
            </div>

            <div className="demo-notice">
              <strong>TRANSMISSION STATUS</strong>
              <span>{transmissionStatus}</span>
            </div>
          </section>
        </div>

        <section className="panel">
          <PanelTitle title="Received Smart Grid Readings" subtitle="Data received through the transmission workflow" />
          <ReadingTable readings={readings} />
        </section>
      </>
    );
  }

  function renderAttacks() {
    const tests = [
      { id: "tampering", title: "Message Tampering", description: "Test detection of a modified data message.", icon: "⌁" },
      { id: "replay", title: "Replay Attack", description: "Test rejection of a previously used message.", icon: "↻" },
      { id: "unknown", title: "Unknown Meter", description: "Test rejection of an unregistered meter.", icon: "?" },
      { id: "invalid", title: "Invalid Authentication", description: "Test rejection of an incorrect response.", icon: "✕" },
      { id: "expired", title: "Expired Challenge", description: "Test rejection of an expired challenge.", icon: "◷" },
    ];

    return (
      <>
        <PageHeading title="Attack Simulator" subtitle="Run security tests for common smart grid threats." />

        <div className="demo-notice wide-notice">
          <strong>SECURITY TESTING</strong>
          <span>These results show the configured responses for each security test.</span>
        </div>

        <div className="attack-grid">
          {tests.map((test) => (
            <section className="panel attack-card" key={test.id}>
              <div className="attack-icon">{test.icon}</div>
              <h3>{test.title}</h3>
              <p>{test.description}</p>
              <button className="button button-outline button-full" disabled={attackBusy} onClick={() => runAttack(test.id)}>
                {attackBusy ? "Running..." : "▶ Run Test"}
              </button>
            </section>
          ))}
        </div>

        {attackResult && (
          <section className="panel attack-result">
            <div className="result-heading">
              <div className="result-icon">✓</div>
              <div>
                <span className="muted-label">TEST RESULT</span>
                <h2>{attackResult.title}</h2>
              </div>
              <span className="status status-green">{attackResult.result}</span>
            </div>

            <p>{attackResult.description}</p>

            <div className="result-detail">
              <span>Detection result</span>
              <strong>{attackResult.action}</strong>
            </div>

            <div className="result-detail">
              <span>Severity</span>
              <strong>{attackResult.severity}</strong>
            </div>

            <div className="demo-notice">
              <strong>SECURITY RESULT</strong>
              <span>The selected security test was rejected.</span>
            </div>
          </section>
        )}
      </>
    );
  }

  function renderLogs() {
    return (
      <>
        <PageHeading title="Security Logs" subtitle="Review events generated by the SmartGrid-Ascon system." />

        <section className="panel">
          <div className="toolbar">
            <div>
              <h3>Event History</h3>
              <p className="muted">Total records: {logs.length}</p>
            </div>

            <div className="toolbar-actions">
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option>All</option>
                <option>Info</option>
                <option>Medium</option>
                <option>High</option>
              </select>

              <button className="button button-outline" onClick={downloadLogs}>
                ↓ Export CSV
              </button>
            </div>
          </div>

          <LogTable logs={filteredLogs} />
        </section>
      </>
    );
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">⚡</div>
          <div>
            <strong>SmartGrid</strong>
            <small>ASCON SECURITY</small>
          </div>
        </div>

        <div className="sidebar-label">MAIN MENU</div>

        <nav>
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => changePage(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
              {page === item.id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-status"><span /> SYSTEM ONLINE</div>
          <p>SmartGrid-Ascon</p>
          <small>Smart Grid Security</small>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu-button" onClick={() => setMobileMenu(!mobileMenu)}>☰</button>

          <div className="breadcrumb">
            <span>Workspace</span>
            <b>/</b>
            <strong>{navigation.find((item) => item.id === page)?.label}</strong>
          </div>

          <div className="topbar-right">
            <span className="demo-pill"><i /> SYSTEM ACTIVE</span>
            <div className="user-avatar">SG</div>
          </div>
        </header>

        <div className="content-area">
          {page === "dashboard" && renderDashboard()}
          {page === "meters" && renderMeters()}
          {page === "authentication" && renderAuthentication()}
          {page === "transmission" && renderTransmission()}
          {page === "attacks" && renderAttacks()}
          {page === "logs" && renderLogs()}

          <footer className="footer">
            <span>SmartGrid-Ascon · Smart Grid Security</span>
            <span>SMART GRID SECURITY WORKFLOW</span>
          </footer>
        </div>
      </main>

      {notification && (
        <div className="toast">
          <span>✓</span>
          {notification}
        </div>
      )}
    </div>
  );
}


// Reusable components

function PageHeading({ title, subtitle }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">SMARTGRID-ASCON / SECURITY CENTER</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function PanelTitle({ title, subtitle }) {
  return (
    <div className="panel-title">
      <div>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, color, note }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}>{icon}</div>
      <span className="stat-title">{title}</span>
      <strong className="stat-value">{value}</strong>
      <span className="stat-note">{note}</span>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusRow({ label, value, good }) {
  return (
    <div className="status-row">
      <span>{label}</span>
      <strong className={good ? "green-text" : "muted"}>
        <i className={good ? "dot-green" : "dot-gray"} />
        {value}
      </strong>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>;
}

function ReadingTable({ readings }) {
  if (!readings.length) {
    return <EmptyState text="No readings available. Transmit a reading first." />;
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Meter ID</th>
            <th>Voltage</th>
            <th>Current</th>
            <th>Power</th>
            <th>Energy</th>
            <th>Security Status</th>
          </tr>
        </thead>
        <tbody>
          {readings.map((reading) => (
            <tr key={reading.id}>
              <td>{new Date(reading.time).toLocaleString()}</td>
              <td><strong>{reading.meter}</strong></td>
              <td>{reading.voltage} V</td>
              <td>{reading.current} A</td>
              <td>{reading.power} W</td>
              <td>{reading.energy} kWh</td>
              <td><span className="status status-green">{reading.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogTable({ logs }) {
  if (!logs.length) {
    return <EmptyState text="No security events available." />;
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Meter</th>
            <th>Event</th>
            <th>Result</th>
            <th>Severity</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((item) => (
            <tr key={item.id}>
              <td>{new Date(item.time).toLocaleString()}</td>
              <td>{item.meter}</td>
              <td>{item.event}</td>
              <td>{item.result}</td>
              <td>
                <span className={`status ${
                  item.severity === "High"
                    ? "status-red"
                    : item.severity === "Medium"
                    ? "status-orange"
                    : "status-blue"
                }`}>
                  {item.severity}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;