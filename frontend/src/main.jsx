import { Activity, BarChart3, Bike, Car, CarFront, CheckCircle2, ChevronDown, CircleAlert, ClipboardList, Download, Eye, EyeOff, FileBarChart, Gauge, KeyRound, List, LoaderCircle, LockKeyhole, MessageSquareWarning, Plus, Search, Settings, Shield, ShieldCheck, ShieldX, Ticket, Truck, UserPlus, Video, VideoOff, X, XCircle } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as XLSX from "xlsx-js-style";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { apiLogin, apiLogout, blockVehicle, clearDemoData, createComplaint, createInvitation, createPermission, createVehicle, evaluateAccess, evaluateAccessSync, fetchCollectionFromAPI, generateCustomerCode, getAccessToken, getAccountVehicles, getCollection, getComplaints, getCustomerHistorySync, getPasswordResetRequests, getPlateContextAPI, getSettings, getVehicleDetections, getVehicleStats, getVehicles, getVehiclesSync, isIndianPlateFormat, markAlertRead, normalizePlate, requestPasswordReset, resetAdminPassword, resolvePasswordReset, saveSetting, searchVehiclesSync, seedDemoData, syncBackendData, updateComplaintStatus } from "./services/localStorageService";
import "./styles.css";
import { CyberBackground } from "./CyberBackground";

const navItems = ["Dashboard", "Live Monitoring", "Vehicles", "Register Vehicle", "Permissions", "Invitations", "Visit History", "Vehicle Verification Center", "Alerts", "Password Requests", "Complaints", "Analytics", "Reports", "Settings"];
const navIcons = { Dashboard: BarChart3, "Live Monitoring": Video, Vehicles: CarFront, "Register Vehicle": UserPlus, Permissions: ShieldCheck, Invitations: Ticket, "Visit History": ClipboardList, "Vehicle Verification Center": Search, Alerts: CircleAlert, "Password Requests": KeyRound, Complaints: MessageSquareWarning, Analytics: BarChart3, Reports: FileBarChart, Settings };
const aiUrl = import.meta.env.VITE_AI_URL || "http://localhost:5001";
const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
const aiEnabled = import.meta.env.VITE_ENABLE_AI !== "false";
const cls = (status = "UNKNOWN") => status.toLowerCase().replaceAll("_", "-");
const clock = (value) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const upper = (value) => String(value ?? "-").toUpperCase();
const normalizeLiveEvent = (event) => {
  const plateNumber = String(event.plateNumber || event.plate || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const timestamp = event.timestamp || new Date().toISOString();
  const access = event.status || event.decision ? null : evaluateAccessSync(plateNumber, timestamp);
  const ocrConfidence = Number.isFinite(Number(event.ocrConfidence ?? event.ocr_confidence)) ? Number(event.ocrConfidence ?? event.ocr_confidence) : 0;
  const status = event.status || access?.status || "UNKNOWN";
  const decision = ["PERMISSION_VALID", "REGISTERED", "INVITATION_ACTIVE", "AUTHORIZED", "TEMPORARY"].includes(status) ? "AUTHORIZED" : ["UNAUTHORIZED", "BLOCKED", "EXPIRED", "UNREGISTERED", "PERMISSION_BLOCKED", "PERMISSION_EXPIRED", "INVITATION_BLOCKED", "INVITATION_EXPIRED", "OCR_FAILED", "OCR_UNCERTAIN"].includes(status) ? (status === "OCR_FAILED" || status === "OCR_UNCERTAIN" ? "UNKNOWN" : "UNAUTHORIZED") : event.decision || access?.decision || "UNKNOWN";
  return { ...event, id: event.id || `LIVE-${Date.now()}`, plateNumber, vehicleType: event.vehicleType || event.vehicle_type || access?.vehicle?.vehicleType || "Unknown", status, decision, ocrConfidence, owner: event.owner || event.ownerName || access?.vehicle?.ownerName || "N/A", purpose: event.purpose || access?.invitation?.purpose || access?.vehicle?.purpose || "N/A", invitationStatus: event.invitation_id || access?.invitation ? "ACTIVE" : "NONE", accessReason: event.reason || event.decision_reason || event.decisionReason || access?.reason, timestamp, source: event.source || "REAL" };
};

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [page, setPage] = useState("Dashboard");
  const [vehicles, setVehicles] = useState([]);
  const [detections, setDetections] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [selectedPlate, setSelectedPlate] = useState("");
  const [manualLookup, setManualLookup] = useState(false);
  const [aiOnline, setAiOnline] = useState(false);
  const prefersReduced = useReducedMotion();
  const refresh = () => { setVehicles(getVehiclesSync()); setDetections(getCollection("detections")); setAlerts(getCollection("alerts")); setCameraOn(Boolean(getSettings().cameraEnabled)); };
  useEffect(() => { seedDemoData(); refresh(); const update = () => refresh(); window.addEventListener("local-data-change", update); return () => window.removeEventListener("local-data-change", update); }, []);
  useEffect(() => {
    if (!currentUser || !aiEnabled) return undefined;
    let stopped = false;
    const probe = async () => {
      try { const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 2500); const response = await fetch(`${aiUrl}/health`, { signal: controller.signal }); window.clearTimeout(timeout); if (!stopped) setAiOnline(response.ok); } catch { if (!stopped) setAiOnline(false); }
    };
    probe();
    const timer = window.setInterval(probe, 5000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [currentUser]);
  useEffect(() => { if (!currentUser) return; clearDemoData(); refresh(); syncBackendData().then(refresh).catch(() => { }); }, [currentUser]);
  useEffect(() => { if (!currentUser) return undefined; let socket; let closed = false; let retry = 0; let timer = 0; const connect = () => { const token = getAccessToken(); if (!token || closed) return; try { socket = new WebSocket(`${apiUrl.replace("http", "ws")}?token=${encodeURIComponent(token)}`); } catch { timer = window.setTimeout(connect, 5000); return; } socket.onmessage = ({ data }) => { try { const message = JSON.parse(data); if (message.type === "snapshot") { const snapshot = (message.data || []).map(normalizeLiveEvent); setDetections(snapshot.slice(0, 100)); return; } if (message.type === "vehicle_detected") { const event = normalizeLiveEvent(message.data); setDetections((current) => [event, ...current.filter((item) => item.id !== event.id)].slice(0, 100)); syncBackendData().then(refresh).catch(() => { }); } } catch { } }; socket.onopen = () => { retry = 0; }; socket.onclose = () => { if (!closed) { retry += 1; timer = window.setTimeout(connect, Math.min(1000 * 2 ** retry, 15000)); } }; socket.onerror = () => { try { socket.close(); } catch { } }; }; connect(); return () => { closed = true; if (timer) window.clearTimeout(timer); if (socket) socket.close(); }; }, [currentUser]);
  if (!currentUser) return <LoginScreen onLogin={setCurrentUser} />;
  if (currentUser.role === "CUSTOMER") return <CustomerDashboard account={currentUser} onLogout={() => { apiLogout(); setCurrentUser(null); }} />;
  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(""), 2400); };
  const toggleCamera = () => { const value = !cameraOn; saveSetting({ cameraEnabled: value }); setCameraOn(value); notify(`Camera turned ${value ? "ON" : "OFF"}`); };
  const stats = { total: detections.length, vehicles: vehicles.length, visits: getCollection("visits").length, authorized: detections.filter((x) => ["AUTHORIZED", "TEMPORARY", "PERMISSION_VALID", "REGISTERED", "INVITATION_ACTIVE"].includes(x.status) || x.decision === "AUTHORIZED").length, unauthorized: detections.filter((x) => ["UNAUTHORIZED", "UNREGISTERED", "PERMISSION_BLOCKED", "PERMISSION_EXPIRED", "INVITATION_BLOCKED", "INVITATION_EXPIRED", "BLOCKED", "EXPIRED"].includes(x.status) || x.decision === "UNAUTHORIZED").length, unknown: detections.filter((x) => ["UNKNOWN", "OCR_FAILED", "OCR_UNCERTAIN", "INVALID_PLATE"].includes(x.status)).length, inside: getCollection("visits").filter((x) => !x.exitTime).length };
  const nav = (value) => { if (value === "Vehicles") setSelectedPlate(""); setPage(value); };
  const handleLiveDetection = async (event) => {
    const plate = normalizePlate(event.plateNumber || event.plate);
    if (!plate) return;
    let normalized = normalizeLiveEvent({ ...event, plateNumber: plate });
    setDetections((current) => [normalized, ...current.filter((item) => item.plateNumber !== plate)].slice(0, 100));
    try {
      const context = await getPlateContextAPI(plate);
      const vehicle = context?.vehicle;
      const invitation = context?.activeInvitation || context?.invitations?.[0];
      const access = context?.access;
      normalized = normalizeLiveEvent({
        ...normalized,
        status: access?.status || normalized.status,
        decision: access?.decision || normalized.decision,
        ownerName: vehicle?.owner_name || vehicle?.ownerName || normalized.owner,
        purpose: invitation?.purpose || invitation?.purpose_type || vehicle?.purpose || normalized.purpose,
        reason: access?.reason || normalized.accessReason,
        vehicleType: vehicle?.vehicle_type || vehicle?.vehicleType || normalized.vehicleType,
      });
      setDetections((current) => [normalized, ...current.filter((item) => item.plateNumber !== plate)].slice(0, 100));
      await syncBackendData();
      refresh();
    } catch (error) {
      console.error("Failed to enrich live detection:", error);
    }
  };
  const content2 = page === "Dashboard" ? <Dashboard stats={stats} detections={detections} current={detections[0]} visits={getCollection("visits")} cameraOn={cameraOn} toggleCamera={toggleCamera} onDetection={handleLiveDetection} openLookup={() => setManualLookup(true)} /> : page === "Live Monitoring" ? <Live current={detections[0]} cameraOn={cameraOn} toggleCamera={toggleCamera} onDetection={handleLiveDetection} openLookup={() => setManualLookup(true)} /> : page === "Vehicles" ? (selectedPlate ? <Profile plate={selectedPlate} vehicles={vehicles} detections={detections} nav={nav} /> : <Vehicles vehicles={query ? searchVehiclesSync(query) : vehicles} query={query} setQuery={setQuery} nav={nav} notify={notify} select={setSelectedPlate} />) : page === "Register Vehicle" ? <Registration nav={nav} notify={notify} vehicles={vehicles} /> : page === "Vehicle Verification Center" ? <Validator vehicles={vehicles} nav={nav} /> : page === "Reports" ? <Reports vehicles={vehicles} visits={getCollection("visits")} detections={detections} /> : page === "Analytics" ? <Analytics vehicles={vehicles} visits={getCollection("visits")} detections={detections} /> : page === "Settings" ? <Diagnostics cameraOn={cameraOn} toggleCamera={toggleCamera} aiOnline={aiOnline} /> : page === "Permissions" ? <AccessManager title="Permissions" collection="permissions" createItem={createPermission} vehicles={vehicles} /> : page === "Invitations" ? <AccessManager title="Invitations" collection="invitations" createItem={createInvitation} vehicles={vehicles} /> : page === "Visit History" ? <History visits={getCollection("visits")} vehicles={vehicles} /> : page === "Alerts" ? <Alerts alerts={alerts} /> : page === "Password Requests" ? <PasswordRequests /> : page === "Complaints" ? <ComplaintsAdmin /> : <Placeholder page={page} vehicles={vehicles} detections={detections} />;
  const liveSignal = aiOnline ? (cameraOn ? "AI Processing Active" : "AI Standby") : cameraOn ? "Camera On \u00b7 AI Offline" : "System Idle";
  return <div className="app-shell"><CyberBackground variant="admin" /><aside className="sidebar"><div className="brand"><div className="brand-mark"><LogoMark theme="admin" size={44} /></div><div className="brand-copy"><strong>NexPlate</strong><span>Intelligent Vehicle Access</span></div></div><nav>{navItems.map((item) => { const Icon = navIcons[item] || List; return <motion.button whileTap={{ scale: 0.97 }} className={page === item ? "active" : ""} onClick={() => nav(item)} key={item} title={item}><Icon size={15} /><span className="nav-label">{item}</span></motion.button>; })}</nav><div className="sidebar-foot"><span className="pulse" /> Admin · {currentUser.displayName}</div></aside><main><header className="top-status-bar"><h1 className="status-title">{page}</h1><div className="status-bar-right"><span className={`status-pill ${aiOnline ? "online" : ""}`}><span className="live-dot" />{liveSignal}</span><span className="admin-badge">ADMIN</span><button className="signout-btn" onClick={() => { apiLogout(); setCurrentUser(null); }}>Sign out</button></div></header><AnimatePresence mode="wait"><motion.div key={page} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: prefersReduced ? 0 : 0.22 }}>{content2}</motion.div></AnimatePresence></main>{manualLookup && <ManualLookup close={() => setManualLookup(false)} />}{toast && <div className="toast"><Activity size={16} /> {toast}</div>}</div>;
}

function LoginScreen({ onLogin }) {
  const [role, setRole] = useState("CUSTOMER");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [forgotOpen, setForgotOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const otpRefs = useRef([]);
  const customer = role === "CUSTOMER";

  const submit = async (event) => {
    event.preventDefault();
    if (loading) return;
    if (customer && !isIndianPlateFormat(username)) return setError("Enter a valid Indian vehicle number.");
    if (!customer && otp.join("").length !== 6) return setError("Enter the 6-digit verification code.");
    setError("");
    setLoading(true);
    try {
      const result = await apiLogin(customer ? normalizePlate(username) : username, password, role);
      onLogin({
        id: result.user.id,
        username: customer ? normalizePlate(username) : username,
        password,
        role: result.user.role,
        displayName: result.user.display_name,
        plateNumber: result.user.plate_number || null,
        vehicleId: null,
        email: result.user.email,
        source: "SUPABASE",
      });
    } catch (loginError) {
      setError(loginError?.message || "Unable to sign in with those details.");
    } finally {
      setLoading(false);
    }
  };

  const changeOtp = (index, value) => {
    const next = [...otp];
    next[index] = value.replace(/\D/g, "").slice(-1);
    setOtp(next);
    if (next[index] && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const switchRole = (nextRole) => {
    setRole(nextRole);
    setError("");
    setOtp(["", "", "", "", "", ""]);
    setForgotOpen(false);
  };

  return (
    <main className={`auth-shell ${customer ? "customer-auth" : "admin-auth"}`}>
      <CyberBackground variant="login" />

      {/* Top Right Luxury Admin Access Lock Button */}
      <div className="top-right-admin-bar">
        <button
          type="button"
          className={`luxury-admin-lock-btn ${!customer ? "mode-active" : ""}`}
          onClick={() => switchRole(customer ? "ADMIN" : "CUSTOMER")}
          title={customer ? "Switch to Security Admin Control" : "Return to Vehicle Customer Access"}
        >
          <LockKeyhole size={13} className="admin-lock-icon" />
          <span className="admin-lock-text">{customer ? "ADMIN" : "CUSTOMER PORTAL"}</span>
        </button>
      </div>

      {!customer && (
        <div className="admin-status">
          SECURE COMMAND INTERFACE <span>•</span> ALL SESSIONS AUDITED
          <button type="button" className="admin-recovery-trigger" onClick={() => setForgotOpen(true)}>
            Admin recovery
          </button>
        </div>
      )}

      <section className="auth-panel">
        <div className="auth-brand">
          <div className="auth-logo"><LogoMark theme={customer ? "customer" : "admin"} size={48} /></div>
          <strong>NexPlate</strong>
        </div>

        <p className="auth-eyebrow">{customer ? "Vehicle Intelligence System" : "Security Command Console"}</p>
        <h1>{customer ? "Vehicle Access Portal" : "Control Center"}</h1>
        <p className="auth-subtitle">
          {customer ? "Enter your registered vehicle number and password to proceed." : "Authorized administrative credentials required."}
        </p>

        <form className="auth-form" onSubmit={submit}>
          <label>
            <span className="auth-input">
              <CarFront size={17} />
              <input
                className={`${customer ? "plate-input" : "admin-input"} ${username ? "has-value" : ""}`}
                value={username}
                placeholder=" "
                onChange={(event) => setUsername(customer ? normalizePlate(event.target.value) : event.target.value)}
                autoComplete="username"
              />
              <small className="float-label">{customer ? "Vehicle Number" : "Admin ID"}</small>
            </span>
          </label>

          <label>
            <span className="auth-input">
              <LockKeyhole size={17} />
              <input
                type={showPassword ? "text" : "password"}
                className={password ? "has-value" : ""}
                value={password}
                placeholder=" "
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
              <small className="float-label">{customer ? "Password" : "Security Password"}</small>
              <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />} {showPassword ? "Hide" : "Show"}
              </button>
            </span>
          </label>

          {!customer && (
            <label>
              6-Digit Security Token
              <div className="otp-row">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(element) => { otpRefs.current[index] = element; }}
                    value={digit}
                    onChange={(event) => changeOtp(index, event.target.value)}
                    inputMode="numeric"
                    maxLength={1}
                    aria-label={`Verification digit ${index + 1}`}
                  />
                ))}
              </div>
            </label>
          )}

          {error && <p className="auth-error">{error}</p>}

          <motion.button whileTap={{ scale: 0.97 }} className="auth-submit" type="submit" disabled={loading}>
            {loading ? "Authenticating..." : customer ? "Access My Dashboard" : "Authenticate & Enter"}
          </motion.button>
        </form>

        {customer && (
          <button type="button" className="forgot-link" onClick={() => setForgotOpen(true)}>
            <KeyRound size={14} /> Forgot password?
          </button>
        )}
        {forgotOpen && (customer ? <ForgotPassword close={() => setForgotOpen(false)} /> : <AdminForgotPassword close={() => setForgotOpen(false)} />)}
        <p className="auth-footer">
          {customer ? "Credential access authorized by facility management." : "All access events logged for regulatory audit."}
        </p>
      </section>
    </main>
  );
}

function VehicleSwitcher({ vehicles, selectedPlate, onSelect, statsByPlate, complaintProps }) {
  const [open, setOpen] = useState(false);
  const [support, setSupport] = useState({ category: "GATE_ISSUE", description: "" });
  const [supportMessage, setSupportMessage] = useState("");
  const [supportItems, setSupportItems] = useState(() => getCollection("complaints").filter((item) => normalizePlate(item.plate_number || item.plateNumber) === normalizePlate(selectedPlate)));
  const groupRef = useRef(null);
  useEffect(() => {
    const close = (event) => { if (groupRef.current && !groupRef.current.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => {
    const refreshSupport = () => setSupportItems(getCollection("complaints").filter((item) => normalizePlate(item.plate_number || item.plateNumber) === normalizePlate(selectedPlate)));
    refreshSupport();
    window.addEventListener("local-data-change", refreshSupport);
    return () => window.removeEventListener("local-data-change", refreshSupport);
  }, [selectedPlate]);
  const submitSupport = async (event) => {
    event.preventDefault();
    if (!support.description.trim()) return setSupportMessage("Describe the issue before submitting.");
    try {
      const created = await createComplaint({ category: support.category, description: support.description.trim(), plateNumber: selectedPlate });
      setSupportItems((current) => [created, ...current]);
      setSupport({ category: "GATE_ISSUE", description: "" });
      setSupportMessage("Complaint submitted.");
    } catch (error) { setSupportMessage(error.message || "Complaint submission failed."); }
  };
  if (!vehicles.length) return <div className="vehicle-switcher"><span className="switch-label">NO LINKED VEHICLES</span></div>;
  const current = vehicles.find((item) => item.plateNumber === selectedPlate) || vehicles[0];
  return <><div className="vehicle-switcher" ref={groupRef}>
    <button className="switch-trigger" onClick={() => setOpen(!open)} aria-expanded={open}><CarFront size={16} /><span><strong>{current.plateNumber}</strong><small>{current.vehicleType} · {current.make || "—"} {current.model || ""}</small></span><ChevronDown size={16} className={`switch-chevron ${open ? "open" : ""}`} /></button>
    {open && <motion.div className="switch-menu" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.16 }}><p className="switch-title">LINKED VEHICLES · {vehicles.length}</p>{vehicles.map((vehicle) => <button key={vehicle.id} className={vehicle.plateNumber === current.plateNumber ? "active" : ""} onClick={() => { onSelect(vehicle.plateNumber); setOpen(false); }}><CarFront size={16} /><span><strong>{vehicle.plateNumber}</strong><small>{vehicle.vehicleType}{statsByPlate?.[vehicle.plateNumber] ? ` · ${statsByPlate[vehicle.plateNumber].detections} events` : ""}</small></span>{vehicle.plateNumber === current.plateNumber && <CheckCircle2 size={15} />}</button>)}</motion.div>}
  </div><CustomerComplaintsPanel {...(complaintProps || { complaints: supportItems, complaint: support, setComplaint: setSupport, saveComplaint: submitSupport, complaintMessage: supportMessage, pendingComplaints: supportItems.filter((item) => ["OPEN", "IN_REVIEW"].includes(item.status)) })} /></>;
}

function CustomerComplaintsPanel({ complaints, complaint, setComplaint, saveComplaint, complaintMessage, pendingComplaints }) {
  return <section className="page-panel customer-complaints"><div className="section-heading"><div><p className="eyebrow">Support</p><h2>Report a problem</h2></div><span className="table-count">{pendingComplaints.length} active</span></div><form className="form-grid" onSubmit={saveComplaint}><label>Category<select value={complaint.category} onChange={(event) => setComplaint({ ...complaint, category: event.target.value })}><option value="GATE_ISSUE">Gate issue</option><option value="WRONG_DETECTION">Wrong detection</option><option value="OTHER">Other</option></select></label><label>Details<textarea maxLength={500} value={complaint.description} onChange={(event) => setComplaint({ ...complaint, description: event.target.value })} placeholder="Describe the issue" required /></label><button type="submit">Submit complaint</button></form>{complaintMessage && <p className="muted-note">{complaintMessage}</p>}{complaints.map((item) => <div className="complaint-item compact" key={item.id}><div className="complaint-head"><span className={`badge ${cls(item.status)}`}>{item.status}</span><small>{item.plate_number || item.plateNumber || "-"}</small></div><p className="complaint-body">{item.description}</p>{item.admin_response && <div className="admin-reply"><strong>Admin response</strong><p>{item.admin_response}</p></div>}</div>)}</section>;
}

function CustomerDashboard({ account, onLogout }) {
  const [vehicles, setVehicles] = useState(() => getAccountVehicles(account));
  const [selectedPlate, setSelectedPlate] = useState(() => getAccountVehicles(account)[0]?.plateNumber || account.plateNumber);
  const [invitations, setInvitations] = useState(() => getCollection("invitations").filter((item) => item.createdBy === account.username || item.ownerPlateNumber === account.plateNumber));
  const [complaints, setComplaints] = useState(() => getCollection("complaints").filter((item) => item.customer_id === account.id || item.createdBy === account.username));
  const [form, setForm] = useState({ plateNumber: "", vehicleType: "Car", person: "", purpose: "Guest Visit", customPurpose: "", duration: "60", startAt: "", endAt: "" });
  const [complaint, setComplaint] = useState({ category: "GATE_ISSUE", description: "" });
  const [message, setMessage] = useState("");
  const [complaintMessage, setComplaintMessage] = useState("");
  const vehicle = vehicles.find((item) => item.plateNumber === selectedPlate);
  const history = getCustomerHistorySync(account, selectedPlate);
  const access = evaluateAccessSync(selectedPlate);
  const evaluateAccess = evaluateAccessSync;
  const ownedPlates = new Set(vehicles.map((item) => item.plateNumber));
  const statsByPlate = Object.fromEntries(vehicles.map((item) => [item.plateNumber, getVehicleStats(item.plateNumber)]));
  const refresh = async () => {
    try {
      if (getAccessToken()) await Promise.all([fetchCollectionFromAPI("invitations"), fetchCollectionFromAPI("complaints"), getVehicles().then(() => undefined)]);
    } catch { }
    const owned = getAccountVehicles(account);
    setVehicles(owned);
    const plates = new Set(owned.map((item) => item.plateNumber));
    setInvitations(getCollection("invitations").filter((item) => plates.has(item.ownerPlateNumber) || item.createdBy === account.username));
    setComplaints(getCollection("complaints").filter((item) => item.customer_id === account.id || item.createdBy === account.username));
  };
  useEffect(() => {
    refresh();
    getComplaints().then(refresh).catch(() => refresh());
    const update = () => refresh();
    window.addEventListener("local-data-change", update);
    return () => window.removeEventListener("local-data-change", update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);
  const updateStart = (startAt, duration = form.duration) => setForm({ ...form, startAt, endAt: startAt && Number(duration) > 0 ? toDateTimeLocal(new Date(new Date(startAt).getTime() + Number(duration) * 60000)) : form.endAt });
  const saveInvitation = async (event) => {
    event.preventDefault();
    if (!isIndianPlateFormat(form.plateNumber)) return setMessage("Enter a valid Indian visitor vehicle number.");
    if (!form.person.trim() || !form.startAt || !form.endAt || new Date(form.endAt) <= new Date(form.startAt)) return setMessage("Enter visitor name, vehicle, and a valid time range");
    if (form.purpose === "Other" && !form.customPurpose) return setMessage("Describe the purpose");
    try {
      const savedInvitations = await createInvitation({ ...form, person: form.person.trim(), purpose: form.purpose === "Other" ? form.customPurpose.trim() : form.purpose, plateNumber: normalizePlate(form.plateNumber), ownerPlateNumber: normalizePlate(selectedPlate || account.plateNumber), createdBy: account.username, status: "ACTIVE", source: "REAL" });
      setInvitations(savedInvitations.filter((item) => item.ownerPlateNumber === normalizePlate(selectedPlate || account.plateNumber) || item.createdBy === account.username));
      setForm({ plateNumber: "", vehicleType: "Car", person: "", purpose: "Guest Visit", customPurpose: "", duration: "60", startAt: "", endAt: "" });
      setMessage("Invitation created");
    } catch (error) { setMessage(error.message || "Invitation could not be created."); }
  };
  const saveComplaint = async (event) => {
    event.preventDefault();
    if (!complaint.description.trim()) return setComplaintMessage("Please describe the issue you are facing.");
    try {
      const created = await createComplaint({ category: complaint.category, description: complaint.description.trim(), vehicleId: vehicle?.id || null, plateNumber: selectedPlate });
      setComplaints((current) => [created, ...current]);
      setComplaint({ category: "GATE_ISSUE", description: "" });
      setComplaintMessage("Complaint submitted — an admin will review it shortly.");
    } catch (error) {
      setComplaintMessage(error.message || "Submission failed. Is the backend running?");
    }
  };
  return <div className="app-shell customer-shell"><CyberBackground variant="customer" /><main><header><div><div className="admin-status-indicator"><span className="admin-indicator-dot" /> ADMIN MONITORED GATEWAY</div><h1>Vehicle Access Portal</h1></div><div className="header-meta"><VehicleSwitcher vehicles={vehicles} selectedPlate={selectedPlate} onSelect={setSelectedPlate} statsByPlate={statsByPlate} /><button onClick={onLogout} className="signout-btn">Sign out</button></div></header><div className="mode-banner"><span className={`live-dot ${access.decision === "AUTHORIZED" ? "authorized" : "danger"}`} /> CUSTOMER MODE <small>{vehicles.length} linked vehicle{vehicles.length === 1 ? "" : "s"} · viewing {selectedPlate}</small></div><section className="content-grid"><section className="page-panel"><p className="eyebrow">Selected vehicle</p><h2>{vehicle?.plateNumber || selectedPlate}</h2><div className="profile-grid"><Info title="Vehicle" values={[["Type", vehicle?.vehicleType], ["Make / model", `${vehicle?.make || "-"} ${vehicle?.model || ""}`], ["Color", vehicle?.color], ["Purpose", vehicle?.purpose]]} /><Info title="Access decision" values={[["Decision", access.decision], ["Reason", access.reason], ["Permission", access.invitation ? "Invitation active" : "Registered vehicle"]]} /><Info title="Activity" values={[["Detections", statsByPlate[selectedPlate]?.detections ?? 0], ["Visits", statsByPlate[selectedPlate]?.visits ?? 0], ["Average stay", statsByPlate[selectedPlate]?.averageStay ? `${Math.floor(statsByPlate[selectedPlate].averageStay / 60)}h ${statsByPlate[selectedPlate].averageStay % 60}m` : "-"]]} /></div></section><section className="page-panel"><div className="section-heading"><div><p className="eyebrow">Invite a vehicle</p><h2>Create invitation <small className="muted-sm">for {selectedPlate}</small></h2></div></div><form className="form-grid" onSubmit={saveInvitation}><label>Vehicle number<input value={form.plateNumber} onChange={(event) => setForm({ ...form, plateNumber: event.target.value })} placeholder="AP28XY4567" required /></label><label>Visitor name<input value={form.person} onChange={(event) => setForm({ ...form, person: event.target.value })} placeholder="Visitor / host name" required /></label><Select name="vehicleType" value={form.vehicleType} onChange={(event) => setForm({ ...form, vehicleType: event.target.value })} values={typesForForm} label="Vehicle type" /><Select name="purpose" value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} values={["Corporate Guest", "Visitor", "Courier Delivery", "Facility Maintenance", "Resident", "Employee", "Staff / Contractor", "Medical / Emergency", "Official VIP", "Other"]} label="Purpose" />{form.purpose === "Other" && <label>Describe the purpose<input value={form.customPurpose} onChange={(event) => setForm({ ...form, customPurpose: event.target.value })} required placeholder="Describe the purpose" /></label>}<Select name="duration" value={form.duration} onChange={(event) => { const duration = event.target.value; setForm({ ...form, duration, endAt: form.startAt && Number(duration) > 0 ? toDateTimeLocal(new Date(new Date(form.startAt).getTime() + Number(duration) * 60000)) : "" }); }} values={durationOptions.map(([value, label]) => `${value}|${label}`)} label="Duration" /><label>Start<input type="datetime-local" value={form.startAt} onChange={(event) => updateStart(event.target.value)} required /></label><label>End<input type="datetime-local" value={form.endAt} onChange={(event) => setForm({ ...form, endAt: event.target.value })} required /></label><button type="submit">Create invitation</button></form>{message && <p className="muted-note">{message}</p>}</section></section><section className="content-grid"><section className="page-panel"><div className="section-heading"><div><p className="eyebrow">Latest 30 records</p><h2>History for {selectedPlate}</h2></div><span className="table-count">{history.length} records</span></div><div className="table-wrap"><table><thead><tr><th>Time</th><th>Plate</th><th>Type</th><th>Status</th></tr></thead><tbody>{history.map((item) => <tr key={`${item.id}-${item.historyType || "visit"}`}><td>{clock(item.entryTime || item.timestamp)}</td><td className="plate">{item.plateNumber}</td><td>{item.historyType || "Visit"}</td><td><span className={`badge ${cls(item.status || item.decision)}`}>{item.status || item.decision}</span></td></tr>)}</tbody></table></div></section><section className="page-panel"><div className="section-heading"><div><p className="eyebrow">Guest access</p><h2>My invitations</h2></div><span className="table-count">{invitations.length} total</span></div><div className="table-wrap"><table><thead><tr><th>Vehicle</th><th>Visitor</th><th>Purpose</th><th>Start</th><th>End</th><th>Current status</th></tr></thead><tbody>{invitations.map((item) => { const current = evaluateAccess(item.plateNumber); return <tr key={item.id}><td className="plate">{item.plateNumber}</td><td>{item.person || "—"}</td><td>{item.purpose}</td><td>{new Date(item.startAt).toLocaleString()}</td><td>{new Date(item.endAt).toLocaleString()}</td><td><span className={`badge ${cls(current.invitation ? "TEMPORARY" : "EXPIRED")}`}>{current.invitation ? "ACTIVE" : "EXPIRED"}</span></td></tr>; })}</tbody></table></div></section></section></main></div>;
}

function ForgotPassword({ close }) {
  const [form, setForm] = useState({ plateNumber: "", ownerName: "" });
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const prefersReduced = useReducedMotion();
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!form.ownerName.trim()) return setError("Enter the owner name exactly as registered.");
    try {
      await requestPasswordReset(form);
      setSent(true);
    } catch (err) {
      setError(err.message || "Request failed. Is the backend running?");
    }
  };
  return <div className="lookup-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><motion.section className="lookup-modal forgot-modal" initial={prefersReduced ? false : { opacity: 0, y: 22, scale: 0.98 }} animate={prefersReduced ? {} : { opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 340, damping: 26 }}><div className="section-heading"><div><p className="eyebrow">Account recovery</p><h2>Request a password reset</h2></div><button className="icon-button" onClick={close}><X size={18} /></button></div>{sent ? <div className="reset-confirm"><CheckCircle2 size={30} /><h3>Request submitted</h3><p>An admin will review this request. After approval, Supabase sends the reset link to the registered customer email.</p><button onClick={close}>Done</button></div> : <form className="form-grid" onSubmit={submit}><label>Vehicle number<input value={form.plateNumber} onChange={(event) => setForm({ ...form, plateNumber: event.target.value })} placeholder="AP12A1234" required /></label><label>Owner name<input value={form.ownerName} onChange={(event) => setForm({ ...form, ownerName: event.target.value })} placeholder="As registered on the vehicle" required /></label>{error && <p className="auth-error">{error}</p>}<button className="auth-submit" type="submit"><KeyRound size={15} /> Submit for approval</button><p className="muted-sm">The reset link is sent only after admin approval.</p></form>}</motion.section></div>;
}

function AdminForgotPassword({ close }) {
  const [form, setForm] = useState({ adminId: "", displayName: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    try { await resetAdminPassword(form); setDone(true); } catch (err) { setError(err.message || "The password-reset request could not be sent."); }
  };
  return <div className="lookup-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><motion.section className="lookup-modal forgot-modal" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}><div className="section-heading"><div><p className="eyebrow">Admin recovery</p><h2>Request a secure reset</h2></div><button className="icon-button" onClick={close}><X size={18} /></button></div>{done ? <div className="reset-confirm"><CheckCircle2 size={30} /><h3>Check your email</h3><p>If the account details match, a password-reset link was sent to the registered email address.</p><button onClick={close}>Done</button></div> : <form className="form-grid" onSubmit={submit}><label>Admin ID or email<input value={form.adminId} onChange={(event) => setForm({ ...form, adminId: event.target.value })} placeholder="admin@nexplate.internal" required /></label><label>Registered name<input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="Your admin display name" required /></label>{error && <p className="auth-error">{error}</p>}<button className="auth-submit" type="submit"><KeyRound size={15} /> Send secure reset link</button><p className="muted-sm">For your security, passwords are changed only through the verified email link.</p></form>}</motion.section></div>;
  /* Legacy direct-password reset UI retained only for source history.
  return <div className="lookup-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><motion.section className="lookup-modal forgot-modal" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }}><div className="section-heading"><div><p className="eyebrow">Admin recovery</p><h2>Change admin password</h2></div><button className="icon-button" onClick={close}><X size={18} /></button></div>{done ? <div className="reset-confirm"><CheckCircle2 size={30} /><h3>Password updated</h3><p>You can sign in with the new admin password now.</p><button onClick={close}>Done</button></div> : <form className="form-grid" onSubmit={submit}><label>Admin ID or email<input value={form.adminId} onChange={(event) => setForm({ ...form, adminId: event.target.value })} placeholder="admin@nexplate.internal" required /></label><label>Registered name<input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="Your admin display name" required /></label><label>New password<input type="password" value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} placeholder="Minimum 8 characters" required /></label>{error && <p className="auth-error">{error}</p>}{message && <p className="muted-note">{message}</p>}<button className="auth-submit" type="submit"><KeyRound size={15} /> Verify and change password</button><p className="muted-sm">The ID/email and registered name must match an ADMIN account.</p></form>}</motion.section></div>;
  */
}

function PasswordRequests() {
  const [requests, setRequests] = useState([]);
  const [message, setMessage] = useState("");
  const load = () => getPasswordResetRequests().then(setRequests).catch(() => { });
  useEffect(() => { load(); }, []);
  const resolve = async (id, action) => {
    setMessage("");
    try { await resolvePasswordReset(id, action); setMessage(action === "APPROVED" ? "Password updated and request approved." : "Request rejected."); load(); } catch (error) { setMessage(error.message || "Action failed"); }
  };
  return <section className="page-panel"><div className="section-heading"><div><p className="eyebrow">Approval queue</p><h2>Password reset requests <span className="demo-chip">{requests.filter((item) => item.status === "PENDING").length} PENDING</span></h2></div></div>{message && <p className="muted-note">{message}</p>}<div className="table-wrap"><table><thead><tr><th>Vehicle</th><th>Owner</th><th>Requested</th><th>Status</th><th>Actions</th></tr></thead><tbody>{requests.map((item) => <tr key={item.id}><td className="plate">{item.plate_number}</td><td>{item.owner_name}</td><td>{new Date(item.created_at).toLocaleString()}</td><td><span className={`badge ${cls(item.status)}`}>{item.status}</span></td><td className="table-actions">{item.status === "PENDING" ? <><button onClick={() => resolve(item.id, "APPROVED")}><CheckCircle2 size={13} /> Approve</button><button className="danger" onClick={() => resolve(item.id, "REJECTED")}><XCircle size={13} /> Reject</button></> : <span className="muted-sm">Resolved</span>}</td></tr>)}</tbody></table>{!requests.length && <div className="empty">No password reset requests yet.</div>}</div></section>;
}

function ComplaintsAdmin() {
  const [complaints, setComplaints] = useState([]);
  const [message, setMessage] = useState("");
  const [replyDrafts, setReplyDrafts] = useState({});
  const [replyOpen, setReplyOpen] = useState({});
  const load = () => getComplaints().then(setComplaints).catch(() => { });
  useEffect(() => { load(); }, []);
  const update = async (id, status) => {
    setMessage("");
    const replyText = (replyDrafts[id] || "").trim();
    try {
      await updateComplaintStatus(id, status, replyText);
      setReplyDrafts((current) => ({ ...current, [id]: "" }));
      setMessage(status === "REJECTED" ? (replyText ? "Complaint rejected and reply sent to the customer." : "Complaint rejected.") : "Complaint updated.");
      load();
    } catch (error) { setMessage(error.message || "Update failed"); }
  };
  return <section className="page-panel"><div className="section-heading"><div><p className="eyebrow">Support inbox</p><h2>Customer complaints <span className="demo-chip">{complaints.filter((item) => item.status === "OPEN").length} OPEN</span></h2></div></div>{message && <p className="muted-note">{message}</p>}<div className="complaint-list">{complaints.map((item) => <div className="complaint-item" key={item.id}><div className="complaint-head"><span className={`badge ${cls(item.category)}`}>{item.category.replace("_", " ")}</span><span className={`badge ${cls(item.status)}`}>{item.status}</span><small>{new Date(item.created_at).toLocaleString()}</small></div><p className="complaint-body">{item.description}</p>{item.admin_response && <div className="admin-reply"><strong>Reply sent</strong><p>{item.admin_response}</p></div>}{replyOpen[item.id] && <div className="complaint-reply-box"><label>Reply to customer<textarea value={replyDrafts[item.id] ?? ""} onChange={(event) => setReplyDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Explain why this complaint is being rejected..." autoFocus /></label><small className="muted-sm">This reply is sent when you reject the complaint.</small></div>}<div className="complaint-meta"><span className="plate">{item.plate_number || "-"}</span><div className="table-actions">{["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"].map((status) => <button key={status} className={item.status === status ? "active" : ""} disabled={item.status === status} onClick={() => status === "REJECTED" && !replyOpen[item.id] ? setReplyOpen((current) => ({ ...current, [item.id]: true })) : update(item.id, status)}>{status === "REJECTED" && !replyOpen[item.id] ? "Reject with reply" : status.replace("_", " ")}</button>)}</div></div></div>)}</div>{!complaints.length && <div className="empty">No complaints yet.</div>}</section>;
}

const typesForForm = ["Sedan", "Hatchback", "Motorcycle", "Electric Scooter", "SUV", "Van", "Heavy Commercial", "Logistics Carrier", "Bus", "Multi-Utility Vehicle", "Emergency Vehicle", "Other", "Unknown"];
const durationOptions = [[15, "15 minutes"], [30, "30 minutes"], [60, "1 hour"], [120, "2 hours"], [240, "4 hours"], [480, "8 hours"], [1440, "1 day"], [2880, "2 days"], [5760, "4 days"], [10080, "1 week"], [0, "Custom"]];
const toDateTimeLocal = (date) => { const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); };

function Actions({ openLookup }) { return <section className="action-row"><div><p className="eyebrow">Vehicle controls</p><strong>Live camera and manual registry lookup</strong></div><div className="actions"><button onClick={openLookup}><Search size={15} /> Search plate</button></div></section>; }

function VehicleAutocomplete({ vehicles, value, onChange, onSelect, onExactMismatch, placeholder, className = "" }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [suggestions, setSuggestions] = useState([]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const term = String(value || "").trim().toLowerCase();
      setSuggestions(term.length < 2 ? [] : vehicles.filter((vehicle) => [vehicle.plateNumber, vehicle.ownerName].some((field) => String(field || "").toLowerCase().includes(term))).slice(0, 6));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [value, vehicles]);
  const choose = (vehicle) => { onSelect(vehicle); setOpen(false); setActive(-1); };
  const keyDown = (event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((index) => Math.min(index + 1, suggestions.length - 1)); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
    if (event.key === "Enter") { event.preventDefault(); if (active >= 0 && suggestions[active]) choose(suggestions[active]); else { const exact = vehicles.find((vehicle) => normalizePlate(vehicle.plateNumber) === normalizePlate(value)); if (exact) choose(exact); else onExactMismatch?.(value); } }
    if (event.key === "Escape") setOpen(false);
  };
  return <div className={`autocomplete ${className}`}><input value={value} placeholder={placeholder} onChange={(event) => { onChange(event.target.value); setOpen(true); }} onFocus={() => suggestions.length && setOpen(true)} onKeyDown={keyDown} />{open && suggestions.length > 0 && <div className="suggestion-menu">{suggestions.map((vehicle, index) => <button type="button" className={index === active ? "highlighted" : ""} key={vehicle.id} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(vehicle)}><strong className="plate">{vehicle.plateNumber}</strong><small>{vehicle.ownerName || "Unknown owner"}</small></button>)}</div>}</div>;
}

function ManualLookup({ close }) {
  const [plate, setPlate] = useState("");
  const [result, setResult] = useState(null);
  const [exactError, setExactError] = useState("");
  const [loading, setLoading] = useState(false);
  const backdropRef = useRef(null);
  const prefersReduced = useReducedMotion();
  const search = async (event) => {
    event.preventDefault();
    const normalized = normalizePlate(plate);
    if (!normalized) return;

    setLoading(true);
    setExactError("");
    setResult(null);

    const fallbackResult = () => {
      const localVehicle = getVehiclesSync().find((item) => normalizePlate(item.plateNumber) === normalized);
      const localInvitations = getCollection("invitations").filter((inv) => normalizePlate(inv.plateNumber) === normalized);
      const localVisits = getCollection("visits").filter((visit) => normalizePlate(visit.plateNumber) === normalized);
      const localDetections = getVehicleDetections(normalized);
      const localResult = localVehicle ? {
        ...localVehicle,
        plateNumber: localVehicle.plateNumber || normalized,
        ownerName: localVehicle.ownerName || "Unknown owner",
        category: "LOCAL CACHE",
        status: localVehicle.status || "AUTHORIZED",
        visits: localVisits,
        detections: localDetections,
        invitations: localInvitations,
        allInvitations: localInvitations,
        activeInvitation: localInvitations.find((inv) => inv.status === "ACTIVE" && new Date(inv.endAt) > new Date()) || null,
      } : {
        plateNumber: normalized,
        category: "LOCAL CACHE",
        status: "UNREGISTERED",
        visits: localVisits,
        detections: localDetections,
        invitations: localInvitations,
        allInvitations: localInvitations,
        activeInvitation: null,
      };
      return localResult;
    };

    try {
      if (!getAccessToken()) {
        setResult(fallbackResult());
        return;
      }

      const response = await fetch(`${apiUrl}/api/vehicles/${normalized}`, {
        headers: { Authorization: `Bearer ${getAccessToken() || ""}` },
      });

      if (!response.ok) {
        throw new Error(`Lookup failed (${response.status})`);
      }

      const payload = await response.json();
      const vehicle = payload && payload.category !== "NEW VEHICLE" ? payload : null;
      const invitations = vehicle ? getCollection("invitations").filter((inv) => normalizePlate(inv.plateNumber) === normalized) : [];
      const visits = vehicle ? getCollection("visits").filter((visit) => normalizePlate(visit.plateNumber) === normalized) : [];
      const detections = vehicle ? getVehicleDetections(normalized) : [];

      setResult({
        ...payload,
        vehicle,
        plateNumber: vehicle?.plateNumber || normalized,
        ownerName: vehicle?.ownerName || payload?.ownerName || "Unknown owner",
        visits,
        detections,
        invitations,
        allInvitations: invitations,
        activeInvitation: invitations.find((inv) => inv.status === "ACTIVE" && new Date(inv.endAt) > new Date()) || null,
        category: payload?.category || (vehicle ? "REGISTERED" : "LOCAL FALLBACK"),
        status: payload?.status || (vehicle ? "AUTHORIZED" : "UNREGISTERED"),
      });
    } catch {
      setResult(fallbackResult());
    } finally {
      setLoading(false);
    }
  };
  return <div className="lookup-backdrop" ref={backdropRef} onMouseDown={(event) => event.target === event.currentTarget && close()}><motion.section className="lookup-modal" initial={prefersReduced ? false : { opacity: 0, y: 22, scale: 0.98 }} animate={prefersReduced ? {} : { opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 340, damping: 26 }} drag={!prefersReduced} dragConstraints={backdropRef} dragElastic={0.1} dragMomentum={false} dragTransition={{ bounceStiffness: 320, bounceDamping: 24 }}><div className="section-heading"><div><p className="eyebrow">Manual fallback</p><h2>Identify vehicle</h2></div><button className="icon-button" onClick={close}><X size={18} /></button></div><form className="lookup-form" onSubmit={search}><input autoFocus value={plate} onChange={(event) => setPlate(event.target.value)} placeholder="ENTER PLATE NUMBER" /><button type="submit"><Search size={15} /> {loading ? "Searching" : "Identify"}</button></form>{result && <div className={`lookup-result ${String(result.status).toLowerCase()}`}><strong>{result.category || result.status}</strong><div className="lookup-grid">{["id", "plateNumber", "vehicleType", "make", "model", "color", "ownerName", "ownerPhone", "driverName", "driverPhone", "purpose", "accessType", "status"].map((field) => <div key={field}><span>{field}</span><b>{upper(result[field])}</b></div>)}</div></div>}</motion.section></div>;
}

function Camera({ cameraOn, toggleCamera, onDetection }) {
  const videoRef = useRef(null);
  const [error, setError] = useState("");
  const [engine, setEngine] = useState("idle");
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [fps, setFps] = useState(0);
  const [resolution, setResolution] = useState("");
  const [cameraState, setCameraState] = useState("OFF");
  const cameraId = "laptop-browser-1";
  const [attempt, setAttempt] = useState(0);

  const startStream = (cameraOn && !error);
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return undefined;
    let cancelled = false;
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      if (cancelled) return;
      const list = devices.filter((device) => device.kind === "videoinput").map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Camera ${index + 1}` }));
      setCameras(list);
      if (list.length && !selectedCamera) setSelectedCamera(list[0].deviceId);
    }).catch(() => { });
    const onChange = () => {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const list = devices.filter((device) => device.kind === "videoinput").map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Camera ${index + 1}` }));
        setCameras(list);
        if (list.length && !list.some((device) => device.deviceId === selectedCamera)) setSelectedCamera(list[0].deviceId);
      }).catch(() => { });
    };
    navigator.mediaDevices.addEventListener?.("devicechange", onChange);
    return () => { cancelled = true; navigator.mediaDevices.removeEventListener?.("devicechange", onChange); };
  }, []);

  useEffect(() => {
    let stream;
    let cancelled = false;
    if (!cameraOn) {
      if (videoRef.current) videoRef.current.srcObject = null;
      setError("");
      setEngine("idle");
      setCameraState("OFF");
      setFps(0);
      return undefined;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera access is unavailable in this browser");
      setCameraState("UNSUPPORTED");
      return undefined;
    }
    const constraints = { video: selectedCamera ? { deviceId: { exact: selectedCamera } } : { facingMode: "user" }, audio: false };
    setCameraState("REQUESTING");
    setError("");
    navigator.mediaDevices.getUserMedia(constraints).then((value) => {
      if (cancelled) {
        value.getTracks().forEach((track) => track.stop());
        return;
      }
      stream = value;
      setCameraState("CONNECTED");
      if (videoRef.current) videoRef.current.srcObject = value;
    }).catch((err) => {
      setError(err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") ? "CAMERA PERMISSION DENIED - allow camera access and restart" : "CAMERA OFFLINE - no camera is available");
      setCameraState(err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") ? "PERMISSION_DENIED" : "OFFLINE");
    });
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (stream && videoRef.current?.srcObject === stream) videoRef.current.srcObject = null;
    };
  }, [cameraOn, selectedCamera, attempt]);
  useEffect(() => {
    if (!cameraOn) return undefined;
    let stopped = false;
    let timer = 0;
    const probe = async () => {
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 2500);
        const response = await fetch(`${aiUrl}/health`, { signal: controller.signal });
        window.clearTimeout(timeout);
        if (!stopped) setEngine(response.ok ? "online" : "offline");
      } catch {
        if (!stopped) setEngine("offline");
      }
      if (!stopped) timer = window.setTimeout(probe, 5000);
    };
    probe();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [cameraOn]);
  useEffect(() => {
    if (!cameraOn || error) return undefined;
    const canvas = document.createElement("canvas");
    let busy = false;
    let lastFrameAt = 0;
    const feedFps = () => {
      const now = Date.now();
      if (lastFrameAt) setFps(Math.round(1000 / Math.max(now - lastFrameAt, 1)));
      lastFrameAt = now;
    };
    const timer = window.setInterval(async () => {
      const video = videoRef.current;
      if (!video || !video.videoWidth || busy) return;
      if (video.videoWidth) setResolution(`${video.videoWidth} x ${video.videoHeight}`);
      busy = true;
      canvas.width = Math.min(video.videoWidth, 960);
      canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      feedFps();
      if (!aiEnabled) { busy = false; return; }
      try {
        const response = await fetch(`${aiUrl}/process-frame`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cameraId, idempotencyKey: `${cameraId}:${Date.now()}`, image: canvas.toDataURL("image/jpeg", 0.72).split(",")[1] }) });
        if (response.ok) {
          setEngine("online");
          const event = await response.json();
          if (event?.plate || event?.plateNumber || event?.status === "NO_VEHICLE") onDetection?.(event);
        }
      } catch { setEngine("offline"); }
      busy = false;
    }, 5000);
    return () => window.clearInterval(timer);
  }, [cameraOn, error]);
  const restartCamera = () => { setError(""); setAttempt((value) => value + 1); if (!cameraOn) return; };
  const engineNote = error || (engine === "online" ? "AI ENGINE ACTIVE" : engine === "offline" ? "PREVIEW ONLY - AI ENGINE NOT CONNECTED" : aiEnabled ? "Connecting to AI engine..." : "AI processing disabled in config");
  const engineClass = error ? "" : `engine-note ${engine}`;
  const cameraBadge = cameraOn ? (error ? "PERMISSION DENIED" : cameraState) : "OFF";
  const statusClass = error ? "error" : cameraOn ? (cameraState === "CONNECTED" ? "live" : "") : "";
  return <div className="camera-panel"><div className="section-heading"><div><p className="eyebrow">Browser camera input</p><h2>Camera monitor <span className={`status-pill camera-state ${statusClass}`}><span className="live-dot" />{cameraBadge}</span></h2></div><div className="camera-controls"><button className={`camera-toggle ${cameraOn ? "on" : ""}`} onClick={toggleCamera}>{cameraOn ? <Video size={14} /> : <VideoOff size={14} />} Camera {cameraOn ? "ON" : "OFF"}</button>{cameraOn && <button className="icon-button" onClick={restartCamera} title="Restart camera"><Video size={14} /> Restart</button>}</div></div>{cameras.length > 1 && <div className="camera-selector"><label>Camera source<select value={selectedCamera} onChange={(event) => setSelectedCamera(event.target.value)}>{cameras.map((camera) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label}</option>)}</select></label></div>}<div className={`camera-stage ${cameraOn && !error ? "camera-live" : ""}`}>{cameraOn && !error ? <><video ref={videoRef} autoPlay playsInline muted /><div className="camera-overlay"><span><span className="live-dot" /> WEB CAMERA LIVE</span><small className={engineClass}>{engineNote}</small></div><div className="camera-stats"><span>{resolution || "connecting..."}</span><span>~{fps} fps</span></div></> : <><CarFront size={52} /><p>{cameraOn ? "Camera unavailable" : "Camera is OFF"}</p><small>{cameraOn ? error || "TURN THE CAMERA ON TO REQUEST YOUR LAPTOP WEBCAM." : "TURN THE CAMERA ON TO REQUEST YOUR LAPTOP WEBCAM."}</small></>}</div></div>;
}
function Detection({ current }) {
  return <div className="detection-panel"><div className="section-heading"><div><p className="eyebrow">Latest signal</p><h2>Current detection</h2></div><Activity size={19} /></div>{current ? <><div className={`decision ${cls(current.status)}`}><span>{upper(current.source || "LIVE")} DATA - {upper(current.status)}</span><strong>{upper(current.plateNumber || "NO READABLE PLATE")}</strong></div><dl><div><dt>Vehicle</dt><dd>{upper(current.vehicleType)}</dd></div><div><dt>OCR text</dt><dd>{upper(current.raw_ocr || current.rawOcr || current.plateNumber || "-")}</dd></div><div><dt>OCR confidence</dt><dd>{current.ocrConfidence > 0 ? `${(current.ocrConfidence * 100).toFixed(1)}%` : "N/A"}</dd></div><div><dt>Format valid</dt><dd>{current.format_valid === true ? "YES" : current.format_valid === false ? "NO" : "-"}</dd></div><div><dt>Decision</dt><dd>{upper(current.decision || "UNKNOWN")}</dd></div><div><dt>Owner</dt><dd>{upper(current.owner || current.ownerName || "-")}</dd></div><div><dt>Purpose</dt><dd>{upper(current.purpose || "-")}</dd></div><div><dt>Invitation</dt><dd>{upper(current.invitationStatus || current.invitation_status || "NONE")}</dd></div><div><dt>Detection source</dt><dd>{upper(current.source || "REAL")}</dd></div><div><dt>Detected at</dt><dd>{current.timestamp ? new Date(current.timestamp).toLocaleTimeString() : "-"}</dd></div>{current.accessReason && <div><dt>Decision reason</dt><dd>{current.accessReason}</dd></div>}</dl></> : <div className="empty">No detections yet. Turn on the live camera or start the Python AI service to begin streaming.</div>}</div>;
}
function Dashboard({ stats, detections, current, cameraOn, toggleCamera, onDetection, openLookup, visits }) { const prefersReduced = useReducedMotion(); const cards = [["Vehicles detected", stats.total, CarFront], ["Registered vehicles", stats.vehicles, CarFront], ["Total visits", stats.visits, Activity], ["Authorized", stats.authorized, ShieldCheck], ["Unauthorized", stats.unauthorized, ShieldX], ["Unknown / review", stats.unknown, CircleAlert], ["Inside now", stats.inside, Activity]]; return <><Actions openLookup={openLookup} /><section className="stat-grid">{cards.map(([label, value, Icon]) => <motion.div className="stat" key={label} whileHover={prefersReduced ? {} : { y: -4 }} transition={{ type: "spring", stiffness: 380, damping: 22 }}><div className="stat-icon"><Icon size={18} /></div><span>{label}</span><strong>{value}</strong></motion.div>)}</section><section className="content-grid"><Camera cameraOn={cameraOn} toggleCamera={toggleCamera} onDetection={onDetection} /><Detection current={current} /></section><VehicleVisitTable visits={visits} vehicles={getVehiclesSync()} title="Live vehicle activity" /></>; }
function visitRow(visit, vehicles) { const plate = visit.plateNumber || visit.plate_number || "-"; const vehicle = vehicles.find((item) => normalizePlate(item.plateNumber || item.plate_number) === normalizePlate(plate)); const entry = visit.entryTime || visit.entry_time || visit.timestamp; const exit = visit.exitTime || visit.exit_time; const duration = visit.durationMinutes ?? visit.duration_minutes; return { id: visit.id || `${plate}-${entry}`, plate, owner: vehicle?.ownerName || vehicle?.owner_name || visit.ownerName || "Unknown", vehicleType: vehicle?.vehicleType || vehicle?.vehicle_type || visit.vehicleType || "Unknown", purpose: visit.purpose || vehicle?.purpose || "-", entry, exit, duration: duration ? `${duration} min` : exit && entry ? `${Math.max(0, Math.round((new Date(exit) - new Date(entry)) / 60000))} min` : "Inside", status: visit.status || visit.authorization_status || visit.decision || "UNKNOWN" }; }

function VehicleVisitTable({ visits = [], vehicles = [], title = "Vehicle activity" }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "entry", direction: "desc" });
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState("");
  const [message, setMessage] = useState("");
  const rows = visits.map((visit) => visitRow(visit, vehicles));
  const filtered = rows.filter((row) => `${row.plate} ${row.owner}`.toLowerCase().includes(search.trim().toLowerCase())).sort((left, right) => { const a = sort.key === "entry" ? new Date(left.entry || 0).getTime() : String(left[sort.key] ?? "").toLowerCase(); const b = sort.key === "entry" ? new Date(right.entry || 0).getTime() : String(right[sort.key] ?? "").toLowerCase(); const result = a < b ? -1 : a > b ? 1 : 0; return sort.direction === "asc" ? result : -result; });
  const pageCount = Math.max(1, Math.ceil(filtered.length / 25));
  const visible = filtered.slice((Math.min(page, pageCount) - 1) * 25, Math.min(page, pageCount) * 25);
  const columns = [["plate", "Plate"], ["owner", "Owner"], ["vehicleType", "Vehicle Type"], ["purpose", "Purpose"], ["entry", "Entry Time"], ["exit", "Exit Time"], ["duration", "Duration"], ["status", "Status"]];
  const setSortKey = (key) => { setPage(1); setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" })); };
  const exportRows = filtered.map((row) => ({ Plate: row.plate, Owner: row.owner, "Vehicle Type": row.vehicleType, Purpose: row.purpose, "Entry Time": row.entry ? new Date(row.entry).toLocaleString() : "-", "Exit Time": row.exit ? new Date(row.exit).toLocaleString() : "Inside", Duration: row.duration, Status: row.status }));
  const exported = () => { setExporting(""); setMessage("Report downloaded"); window.setTimeout(() => setMessage(""), 2400); };
  const exportExcel = async () => { setExporting("excel"); await new Promise((resolve) => window.setTimeout(resolve, 0)); const worksheet = XLSX.utils.json_to_sheet(exportRows); const headers = Object.keys(exportRows[0] || { Plate: "" }); headers.forEach((header, index) => { const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c: index })]; if (cell) cell.s = { font: { bold: true, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "0891B2" } } }; }); worksheet["!cols"] = headers.map(() => ({ wch: 22 })); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Vehicle Report"); XLSX.writeFile(workbook, `nexplate-report-${new Date().toISOString().slice(0, 10)}.xlsx`); exported(); };
  const exportPdf = async () => { setExporting("pdf"); await new Promise((resolve) => window.setTimeout(resolve, 0)); const document = new jsPDF({ orientation: "landscape" }); document.setFontSize(15); document.text("NexPlate AI - Vehicle Report", 14, 15); document.setFontSize(9); document.text(`Exported ${new Date().toLocaleString()}${search ? ` | Search: ${search}` : ""}`, 14, 22); autoTable(document, { head: [Object.keys(exportRows[0] || { Plate: "" })], body: exportRows.map((row) => Object.values(row)), startY: 28, styles: { fontSize: 8 }, headStyles: { fillColor: [6, 182, 212] }, margin: { left: 10, right: 10 }, showHead: "everyPage" }); document.save(`nexplate-report-${new Date().toISOString().slice(0, 10)}.pdf`); exported(); };
  return <section className="table-panel live-table"><div className="section-heading"><div><p className="eyebrow">Realtime records <span className="live-label"><span className="live-dot" /> Live</span></p><h2>{title}</h2></div><div className="table-tools"><span className="table-count">{filtered.length} records</span><button type="button" disabled={Boolean(exporting)} onClick={exportExcel}>{exporting === "excel" ? "Exporting..." : "Export Excel"}</button><button type="button" disabled={Boolean(exporting)} onClick={exportPdf}>{exporting === "pdf" ? "Exporting..." : "Export PDF"}</button></div></div><div className="table-search"><Search size={15} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search plate or owner" /></div><div className="table-wrap"><table><thead><tr>{columns.map(([key, label]) => <th key={key}><button type="button" className="sort-button" onClick={() => setSortKey(key)}>{label}{sort.key === key ? (sort.direction === "asc" ? " " : " ") : ""}</button></th>)}</tr></thead><tbody>{visible.map((row) => <tr key={row.id}><td className="plate">{upper(row.plate)}</td><td>{row.owner}</td><td>{row.vehicleType}</td><td>{row.purpose}</td><td>{row.entry ? new Date(row.entry).toLocaleString() : "-"}</td><td>{row.exit ? new Date(row.exit).toLocaleString() : "Inside"}</td><td>{row.duration}</td><td><span className={`badge ${cls(row.status)}`}>{upper(row.status)}</span></td></tr>)}</tbody></table>{!visible.length && <div className="empty">No vehicle or visit records match the current search.</div>}</div><div className="table-footer"><span>{message || `Page ${Math.min(page, pageCount)} of ${pageCount}`}</span><div className="actions"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button></div></div></section>;
}
function EventTable({ detections }) { return <VehicleVisitTable title="Detection and visit activity" visits={detections.map((detection) => ({ ...detection, entryTime: detection.entryTime || detection.timestamp, status: detection.status || detection.decision }))} vehicles={getVehiclesSync()} />; }
function Live({ current, cameraOn, toggleCamera, onDetection, openLookup }) { return <><Actions openLookup={openLookup} /><section className="content-grid"><Camera cameraOn={cameraOn} toggleCamera={toggleCamera} onDetection={onDetection} /><Detection current={current} /></section></>; }
function Vehicles({ vehicles, query, setQuery, nav, notify, select }) {
  return <section className="page-panel"><div className="section-heading"><div><p className="eyebrow">Registry</p><h2>Vehicle records <span className="demo-chip">{vehicles.length} CURRENT</span></h2></div><button onClick={() => nav("Register Vehicle")}><Plus size={15} /> Register vehicle</button></div><label className="search-box"><Search size={16} /><VehicleAutocomplete vehicles={getVehiclesSync()} value={query} onChange={setQuery} onSelect={(vehicle) => { setQuery(vehicle.plateNumber); select(vehicle.plateNumber); }} onExactMismatch={() => undefined} placeholder="Search plate, owner, driver, customer ID, phone, type or purpose" /></label><div className="table-wrap"><table><thead><tr><th>Plate</th><th>Type</th><th>Make</th><th>Owner</th><th>Customer ID</th><th>Site</th><th>Purpose</th><th>Status</th><th>Actions</th></tr></thead><tbody>{vehicles.map((vehicle) => <tr key={vehicle.id} onClick={() => select(vehicle.plateNumber)}><td className="plate">{vehicle.plateNumber}</td><td>{vehicle.vehicleType}</td><td>{vehicle.make || "-"} {vehicle.model || ""}</td><td>{vehicle.ownerName}</td><td className="plate">{vehicle.customerCode || "-"}</td><td>{vehicle.houseNo || "-"}</td><td>{vehicle.purpose || "-"}</td><td><span className={`badge ${cls(vehicle.status)}`}>{vehicle.status}</span></td><td><button className="table-action" disabled={vehicle.status === "BLOCKED"} onClick={(event) => { event.stopPropagation(); void blockVehicle(vehicle.id).then(() => notify("Vehicle blocked")).catch((error) => notify(error.message || "Block failed")); }}><LockKeyhole size={13} /> Block</button></td></tr>)}</tbody></table>{!vehicles.length && <div className="empty">No vehicles found. {query ? "Try a different search." : "Register your first vehicle."}</div>}</div></section>;
}
function RegistrationTools({ notify }) {
  const [status, setStatus] = useState("");
  const importing = status.indexOf("Importing") === 0;
  const template = [{ plateNumber: "AP12JA1234", vehicleType: "Car", make: "Honda", model: "City", color: "White", ownerName: "Ravi Kumar", ownerPhone: "9876543210", driverName: "Ravi Kumar", driverPhone: "9876543210", purpose: "Employee", accessType: "Permanent", validFrom: "2026-09-05", validUntil: "2026-12-31", password: "customer123" }, { plateNumber: "TS09GH4567", vehicleType: "Bus", make: "Ashok Leyland", model: "Viking", color: "White", ownerName: "Anita Sharma", ownerPhone: "9866501234", driverName: "Anita Sharma", driverPhone: "9866501234", purpose: "Student", accessType: "Temporary", validFrom: "2026-09-05", validUntil: "2026-12-31", password: "customer456" }];
  const download = () => downloadCsv("vehicle-registration-template.csv", template);
  const importCsv = (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const rows = parseCsv(String(reader.result || ""));
      if (!rows.length) { setStatus("CSV must have a header row and at least one vehicle"); return; }
      setStatus("Importing " + rows.length + " vehicles...");
      let ok = 0;
      const errors = [];
      for (const row of rows) {
        try {
          await createVehicle(row, row.password || "");
          ok += 1;
        } catch (error) {
          errors.push((row.plateNumber || "row") + ": " + (error.message || "failed"));
        }
      }
      setStatus(ok + " of " + rows.length + " registered" + (errors.length ? " · " + errors[0] : ""));
      notify(ok + " vehicle(s) registered to the Supabase registry" + (errors.length ? " · " + errors[0] : ""));
    };
    reader.readAsText(file);
    event.target.value = "";
  };
  return <div className="registration-tools"><button type="button" onClick={download}><Download size={14} /> Template</button><label className="file-button">{importing ? "Importing..." : "Import CSV"}<input type="file" accept=".csv" disabled={importing} onChange={importCsv} /></label>{status && <small className="import-status">{status}</small>}</div>;
}
function Registration({ nav, notify, vehicles }) {
  const [mode, setMode] = useState("NEW");
  const [customer, setCustomer] = useState(null);
  const [form, setForm] = useState({ plateNumber: "", vehicleType: "Car", make: "", model: "", color: "", ownerName: "", ownerPhone: "", ownerEmail: "", houseNo: "", driverName: "", driverPhone: "", purpose: "Employee", accessType: "Permanent", validFrom: "", validUntil: "", password: "" });
  const [customerQuery, setCustomerQuery] = useState("");
  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  const customerMatches = customerQuery.length > 1 ? vehicles.filter((vehicle) => [vehicle.ownerName, vehicle.ownerPhone, vehicle.customerCode, vehicle.ownerEmail, vehicle.houseNo].some((value) => String(value || "").toLowerCase().includes(customerQuery.toLowerCase()))).slice(0, 6) : [];
  const selectCustomer = (vehicle) => { setCustomer(vehicle); setCustomerQuery(vehicle.ownerName || vehicle.customerCode || ""); setForm((current) => ({ ...current, ownerName: vehicle.ownerName || "", ownerPhone: vehicle.ownerPhone || "", houseNo: vehicle.houseNo || "" })); };
  const submit = async (event) => {
    event.preventDefault();
    const plateNumber = normalizePlate(form.plateNumber);
    if (!plateNumber || !form.make || !form.model) return notify("Plate number, make, and model are required");
    if (mode === "NEW" && (!form.ownerName || !form.password)) return notify("Customer name and password are required");
    if (mode === "EXISTING" && !customer) return notify("Select an existing customer first");
    const customerCode = customer?.customerCode || generateCustomerCode();
    try {
      await createVehicle({ ...form, plateNumber, customerId: customer?.customer_id || customer?.customerId, customerCode, status: "AUTHORIZED", demoData: false, ownerEmail: form.ownerEmail }, mode === "NEW" ? form.password : "");
      notify(`Vehicle registered. Customer ID: ${customerCode}`);
      nav("Vehicles");
    } catch (error) { notify(error.message || "Registration failed"); }
  };
  const fields = [["plateNumber", "License plate *"], ["make", "Vehicle make *"], ["model", "Vehicle model *"], ["color", "Color"], ["ownerEmail", "Email"], ["validFrom", "Valid from"], ["validUntil", "Valid until"]];
  return <section className="page-panel registration"><div className="section-heading"><div><p className="eyebrow">Registry portal</p><h2>{mode === "NEW" ? "Register vehicle and customer" : "Add vehicle to existing customer"}</h2></div><RegistrationTools notify={notify} /></div><div className="auth-switch registration-mode"><button type="button" className={mode === "NEW" ? "active" : ""} onClick={() => setMode("NEW")}>New Customer</button><button type="button" className={mode === "EXISTING" ? "active" : ""} onClick={() => setMode("EXISTING")}>Existing Customer</button></div>{mode === "EXISTING" && <div className="customer-picker"><input value={customerQuery} onChange={(event) => { setCustomerQuery(event.target.value); setCustomer(null); }} placeholder="Search by name, phone, or Customer ID" />{customerMatches.length > 0 && <div className="suggestion-menu">{customerMatches.map((vehicle) => <button type="button" key={vehicle.id} onClick={() => selectCustomer(vehicle)}><strong>{vehicle.ownerName}</strong><small>{vehicle.customerCode || "Customer"} · {vehicle.plateNumber}</small></button>)}</div>}{customer && <div className="customer-summary"><strong>{customer.ownerName}</strong><span>{customer.houseNo || "Site not set"} · {customer.ownerPhone || "Phone not set"}</span><small>{vehicles.filter((vehicle) => vehicle.customer_id === customer.customer_id || vehicle.ownerName === customer.ownerName).map((vehicle) => `${vehicle.plateNumber} · ${vehicle.vehicleType}`).join(" | ")}</small></div>}</div>}<form onSubmit={submit}><div className="form-grid">{mode === "NEW" && <><label>Owner name *<input name="ownerName" value={form.ownerName} onChange={change} required placeholder="Owner name" /></label><label>Owner phone<input name="ownerPhone" value={form.ownerPhone} onChange={change} placeholder="Phone" /></label><label>Owner email<input name="ownerEmail" value={form.ownerEmail} onChange={change} placeholder="Email" type="email" /></label><label>Site / unit<input name="houseNo" value={form.houseNo} onChange={change} placeholder="Site or unit" /></label><label>Driver name<input name="driverName" value={form.driverName} onChange={change} placeholder="Driver name" /></label><label>Driver phone<input name="driverPhone" value={form.driverPhone} onChange={change} placeholder="Driver phone" /></label><label>Customer password *<input type="password" name="password" value={form.password} onChange={change} required placeholder="Customer password" /></label></>}{fields.map(([name, label]) => <label key={name}>{label}<input type={name.startsWith("valid") ? "date" : "text"} name={name} value={form[name]} onChange={change} required={name === "plateNumber" || name === "make" || name === "model"} placeholder={label} /></label>)}<Select name="vehicleType" value={form.vehicleType} onChange={change} values={typesForForm} label="Vehicle type" /><Select name="purpose" value={form.purpose} onChange={change} values={["Resident", "Employee", "Student", "Visitor", "Delivery", "Faculty", "Maintenance", "Official", "Emergency", "Guest", "Service"]} label="Purpose" /><Select name="accessType" value={form.accessType} onChange={change} values={["Permanent", "Temporary", "Invitation Based"]} label="Access type" /></div><div className="form-footer"><span>{mode === "NEW" ? "Customer ID is generated on save." : `Selected customer: ${customer?.ownerName || "none"}`}</span><button type="submit"><UserPlus size={15} /> {mode === "NEW" ? "Save vehicle and account" : `Add Vehicle to ${customer?.ownerName || "customer"}`}</button></div></form></section>;
}
function Select({ name, value, onChange, values, label }) { return <label>{label}<select name={name} value={value} onChange={onChange}>{values.map((item) => { const optionValue = String(item).includes("|") ? String(item).split("|")[0] : item; const optionLabel = String(item).includes("|") ? String(item).split("|").slice(1).join("|") : item; return <option key={optionValue} value={optionValue}>{optionLabel}</option>; })}</select></label>; }
function Validator({ vehicles, nav }) {
  const [plate, setPlate] = useState("");
  const [result, setResult] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [exactError, setExactError] = useState("");
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState("local");
  const check = async (event) => {
    event?.preventDefault();
    const normalized = normalizePlate(plate);
    setExactError("");
    if (!normalized) return;
    setLoading(true);
    try {
      const valid = /^(AP|TS|TN|KA)\d{1,2}[A-Z]{1,3}\d{1,4}$/.test(normalized);
      const context = await getPlateContextAPI(normalized);
      let vehicle = null;
      let visits = [];
      let detections = [];
      let allInvitations = [];
      let activeInvitation = null;
      let access = null;
      if (context) {
        vehicle = context.vehicle;
        visits = context.visits || [];
        detections = context.detections || [];
        allInvitations = context.invitations || [];
        activeInvitation = context.activeInvitation || null;
        access = context.access;
        setSource("API");
      } else {
        vehicle = vehicles.find((item) => item.plateNumber === normalized);
        if (vehicle) {
          visits = getCollection("visits").filter((v) => v.plateNumber === vehicle.plateNumber);
          detections = getVehicleDetections(vehicle.plateNumber);
          allInvitations = getCollection("invitations").filter((inv) => normalizePlate(inv.plateNumber) === normalizePlate(vehicle.plateNumber));
          activeInvitation = allInvitations.find((inv) => inv.status === "ACTIVE" && new Date(inv.endAt) > new Date());
        }
        access = vehicle ? evaluateAccessSync(vehicle.plateNumber) : null;
        setSource("LOCAL");
      }
      let decision = access?.decision || "UNKNOWN";
      let reason = access?.reason || "";
      if (!vehicle && !activeInvitation) {
        if (access && access.status !== "UNREGISTERED") { decision = access.decision; reason = access.reason || ""; }
        else { decision = valid ? "UNREGISTERED" : "INVALID_PLATE"; reason = valid ? "Vehicle is not registered and has no active invitation." : "Plate format does not match known patterns."; }
      }
      const currentInvitation = allInvitations.find((invitation) => invitation.status === "ACTIVE" && new Date(invitation.start_at || invitation.startAt) <= new Date() && new Date(invitation.end_at || invitation.endAt) >= new Date()) || activeInvitation;
      const latestInvitation = [...allInvitations].sort((left, right) => new Date(right.end_at || right.endAt || right.created_at || right.createdAt || 0) - new Date(left.end_at || left.endAt || left.created_at || left.createdAt || 0))[0] || null;
      if (!vehicle && currentInvitation && access?.decision === "AUTHORIZED") {
        decision = "AUTHORIZED";
        reason = access.reason || "Active invitation is valid for the current time";
      }
      setResult({ valid, vehicle, normalized, decision, reason, visits: visits.slice(0, 30), detections: detections.slice(0, 30), allInvitations, activeInvitation: currentInvitation, latestInvitation, access, invitations: allInvitations });
    } finally {
      setLoading(false);
    }
  };
  const maskPhone = (phone) => { const value = String(phone || ""); return value.length > 4 && !revealed ? `\u2022\u2022\u2022\u2022\u2022\u2022${value.slice(-4)}` : value || "Not available"; };
  const decisionClass = (d) => d === "AUTHORIZED" ? "authorized" : d === "UNAUTHORIZED" ? "unauthorized" : d === "INVALID_PLATE" ? "invalid-plate" : "ocr-failed";
  const now = new Date();
  const timeValidFor = (inv) => { if (!inv) return "—"; const start = new Date(inv.start_at || inv.startAt); const end = new Date(inv.end_at || inv.endAt); return now >= start && now <= end ? "VALID" : "OUTSIDE WINDOW"; };
  const licenseContext = (inv) => { if (!inv) return "—"; const start = new Date(inv.start_at || inv.startAt); const end = new Date(inv.end_at || inv.endAt); return `${start.toLocaleString()} → ${end.toLocaleString()}`; };
  return <section className="page-panel validator-page"><p className="eyebrow">Manual vehicle verification</p><h2>Vehicle Verification Center</h2><form className="validator-input" onSubmit={check}><VehicleAutocomplete vehicles={vehicles} value={plate} onChange={(value) => { setPlate(value); setExactError(""); }} onSelect={(vehicle) => { setPlate(vehicle.plateNumber); setExactError(""); }} onExactMismatch={(value) => setExactError(`No exact match for '${value}' \u2014 check the plate number`)} placeholder="AP12JA1234" /><button type="submit">{loading ? "Checking..." : "Check plate"}</button></form>{exactError && <p className="auth-error">{exactError}</p>}{result && <div style={{ marginTop: 20, display: "grid", gap: 18 }}>
    <div className={`decision ${decisionClass(result.decision)}`}><span>Verification result · {source === "API" ? "LIVE DATABASE" : "LOCAL CACHE"}</span><strong>{result.decision.replace(/_/g, " ")}</strong><span style={{ marginTop: 6, fontSize: 12 }}>{result.reason}</span></div>
    {!result.vehicle && result.decision !== "AUTHORIZED" && !result.activeInvitation && <div className="validation-empty"><CircleAlert size={24} /><strong>{result.valid ? "Not found in registry" : "Invalid plate format"}</strong><span>{result.valid ? `${result.normalized} is a valid format but is not registered and has no active invitation.` : "This plate does not match a supported format."}</span><button type="button" onClick={() => nav("Register Vehicle")}>Register this vehicle</button></div>}
    <div className="validator-time-card"><span><strong>CURRENT TIME</strong><em>{now.toLocaleString()}</em></span>{result.activeInvitation ? <span><strong>INVITATION WINDOW</strong><em>{licenseContext(result.activeInvitation)}</em></span> : <span><strong>REGISTRATION</strong><em>{result.vehicle ? `${result.vehicle.plateNumber} · ${result.vehicle.status}` : "NOT REGISTERED"}</em></span>}<span><strong>TIME CHECK</strong><em className={timeValidFor(result.activeInvitation) === "VALID" ? "ok" : "bad"}>{result.activeInvitation ? timeValidFor(result.activeInvitation) : result.vehicle ? "PERMISSION CHECK" : "N/A"}</em></span></div>
    <div className="profile-grid">
      <Info title="AI / OCR" values={[["Normalized plate", result.normalized], ["Format valid", result.valid ? "Yes" : "No"], ["Database", result.vehicle ? "REGISTERED" : "NOT FOUND"], ["Raw OCR", result.detections?.[0]?.raw_ocr || "-"], ["OCR confidence", result.detections?.[0]?.ocr_confidence ? `${(Number(result.detections[0].ocr_confidence) * 100).toFixed(1)}%` : "-"], ["Last status", result.detections?.[0]?.status || "-"]]} />
      {result.vehicle && <Info title="Vehicle" values={[["Plate", result.vehicle.plateNumber], ["Type", result.vehicle.vehicleType || "-"], ["Make / model", `${result.vehicle.make || "-"} ${result.vehicle.model || ""}`], ["Color", result.vehicle.color || "-"], ["Purpose", result.vehicle.purpose || "-"], ["Status", result.vehicle.status || "-"]]} />}
      {result.vehicle && <Info title="Customer" values={[["Customer ID", result.vehicle.customerCode || result.vehicle.customer_id || "-"], ["Owner", result.vehicle.ownerName], ["Location / unit", result.vehicle.houseNo || "-"], ["Phone", maskPhone(result.vehicle.ownerPhone)], ["Email", result.vehicle.ownerEmail || "-"]]} />}
      {result.vehicle && <Info title="Driver" values={[["Driver name", result.vehicle.driverName || "—"], ["Driver phone", maskPhone(result.vehicle.driverPhone)], ["Registration", result.vehicle.registrationStatus || result.vehicle.status || "-"], ["Access type", result.vehicle.accessType || "-"]]} />}
      {result.vehicle && <Info title="Permission" values={[["Valid from", result.vehicle.validFrom || result.vehicle.valid_from ? new Date(result.vehicle.validFrom || result.vehicle.valid_from).toLocaleString() : "-"], ["Valid until", result.vehicle.validUntil || result.vehicle.valid_until ? new Date(result.vehicle.validUntil || result.vehicle.valid_until).toLocaleString() : "-"], ["Decision", result.decision], ["Reason", result.reason]]} />}
      {result.latestInvitation && <Info title="Invitation" values={[["Status", result.latestInvitation.status || "-"], ["Visitor", result.latestInvitation.person || result.latestInvitation.visitorName || "-"], ["Vehicle type", result.latestInvitation.vehicle_type || result.latestInvitation.vehicleType || "-"], ["Purpose", result.latestInvitation.purpose || "-"], ["Description", result.latestInvitation.purposeDescription || result.latestInvitation.purpose_description || "-"], ["Invited by", result.latestInvitation.invitedBy || result.latestInvitation.invited_by_role || "-"], ["Customer / owner", result.latestInvitation.owner_id || result.latestInvitation.ownerId || "-"], ["Destination", result.latestInvitation.destination || result.latestInvitation.destination_unit || "-"], ["Start", licenseContext(result.latestInvitation)?.split("→")[0] || "-"], ["End", licenseContext(result.latestInvitation)?.split("→")[1] || "-"], ["Time validity", result.activeInvitation ? timeValidFor(result.activeInvitation) : timeValidFor(result.latestInvitation)]]} />}
    </div>
    {result.allInvitations.length > 0 && <div className="history-block"><div className="section-heading"><h2>Invitations</h2><span>{result.allInvitations.length} total · {result.allInvitations.filter((inv) => inv.status === "ACTIVE").length} active</span></div><div className="table-wrap"><table><thead><tr><th>Visitor</th><th>Vehicle</th><th>Purpose</th><th>Start</th><th>End</th><th>Status</th><th>Invited by</th></tr></thead><tbody>{result.allInvitations.slice(0, 10).map((inv) => <tr key={inv.id}><td>{inv.person || inv.visitorName || "-"}</td><td className="plate">{inv.plateNumber || inv.plate_number}</td><td>{inv.purpose || "-"}</td><td>{new Date(inv.startAt || inv.start_at).toLocaleString()}</td><td>{new Date(inv.endAt || inv.end_at).toLocaleString()}</td><td><span className={`badge ${cls(inv.status)}`}>{inv.status}</span></td><td>{inv.invitedBy || inv.created_by || "-"}</td></tr>)}</tbody></table></div></div>}
    {result.visits.length > 0 && <div className="history-block"><div className="section-heading"><h2>Recent visits</h2><span>{result.visits.length} records · newest first</span></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Entry</th><th>Exit</th><th>Duration</th><th>Status</th></tr></thead><tbody>{result.visits.slice(0, 10).map((visit) => <tr key={visit.id}><td>{new Date(visit.entryTime || visit.entry_time).toLocaleDateString()}</td><td>{new Date(visit.entryTime || visit.entry_time).toLocaleTimeString()}</td><td>{visit.exitTime || visit.exit_time ? new Date(visit.exitTime || visit.exit_time).toLocaleTimeString() : "Inside"}</td><td>{visit.durationMinutes ? `${visit.durationMinutes} min` : "-"}</td><td><span className={`badge ${cls(visit.status || visit.authorization_status)}`}>{visit.status || visit.authorization_status || "-"}</span></td></tr>)}</tbody></table></div></div>}
    {result.detections.length > 0 && <div className="history-block"><div className="section-heading"><h2>Detection / access history</h2><span>{result.detections.length} records</span></div><div className="table-wrap"><table><thead><tr><th>Time</th><th>Status</th><th>Decision</th><th>Confidence</th><th>Camera</th></tr></thead><tbody>{result.detections.slice(0, 10).map((detection) => <tr key={detection.id}><td>{new Date(detection.detected_at || detection.timestamp).toLocaleString()}</td><td><span className={`badge ${cls(detection.status)}`}>{detection.status}</span></td><td>{detection.decision || "-"}</td><td>{detection.ocr_confidence ? `${(Number(detection.ocr_confidence) * 100).toFixed(1)}%` : "-"}</td><td>{detection.camera_id || "-"}</td></tr>)}</tbody></table></div></div>}
  </div>}</section>;
}
function Alerts({ alerts }) { return <section className="page-panel"><div className="section-heading"><div><p className="eyebrow">Operations</p><h2>Alert center</h2></div><span className="table-count">{alerts.filter((x) => !(x.read || x.isRead)).length} unread</span></div><div className="alert-list">{alerts.map((alert) => <div className={`alert-item ${alert.read || alert.isRead ? "acknowledged" : ""}`} key={alert.id}><CircleAlert size={17} /><div><strong>{alert.type}</strong><span>{alert.plateNumber} · {alert.message}</span></div><small>{clock(alert.timestamp)}</small>{!(alert.read || alert.isRead) && <button className="table-action" onClick={() => markAlertRead(alert.id)}>Acknowledge</button>}</div>)}</div></section>; }
function Placeholder({ page, vehicles, detections }) { return <section className="page-panel placeholder"><List size={26} /><h2>{page}</h2><p>{vehicles.length} vehicles and {detections.length} detections are available in the Supabase registry.</p></section>; }

function AccessManagerLegacy({ title, collection, createItem, vehicles }) {
  const isInvitation = title === "Invitations";
  const purposes = ["Guest Visit", "Family / Relative", "Friend", "Delivery", "Food Delivery", "Courier", "Maintenance", "Electrician", "Plumber", "Driver", "Domestic Service", "Contractor", "Employee", "Student", "Faculty", "Staff", "Event", "Medical", "Emergency", "Official Visit", "Other"];
  const [form, setForm] = useState({ plateNumber: "", ownerPlateNumber: vehicles[0]?.plateNumber || "", person: "", purpose: "Guest Visit", customPurpose: "", validFrom: "", validUntil: "", duration: "60", startAt: "", endAt: "", destination: "", notes: "" });
  const [customerQuery, setCustomerQuery] = useState("");
  const [customer, setCustomer] = useState(null);
  const [items, setItems] = useState(() => getCollection(collection));
  const [loader, setLoader] = useState(false);
  const [status, setStatus] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { let mounted = true; (async () => { setLoader(true); const data = await fetchCollectionFromAPI(collection); if (mounted) { setItems(data); setLoader(false); } })(); return () => { mounted = false; }; }, [collection, refresh]);
  useEffect(() => { if (isInvitation && customer) setForm((current) => ({ ...current, ownerPlateNumber: customer.plateNumber })); }, [customer, isInvitation]);
  const save = async (event) => {
    event.preventDefault();
    if (!form.person || (form.purpose === "Other" && !form.customPurpose)) { setStatus("Visitor / person name" + (form.purpose === "Other" ? " and a purpose description" : "") + " are required"); return; }
    if (isInvitation && (!form.startAt || !form.endAt || new Date(form.endAt) <= new Date(form.startAt))) { setStatus("Invitation requires a valid start and end time"); return; }
    if (!isInvitation && (!form.validFrom || !form.validUntil)) { setStatus("Permission requires a validity window"); return; }
    setLoader(true); setStatus("");
    await createItem({ ...form, purpose: form.purpose === "Other" ? form.customPurpose : form.purpose, purposeDescription: form.purpose === "Other" ? form.customPurpose : "", reason: form.purpose === "Other" ? form.customPurpose : form.purpose, ownerPlateNumber: form.ownerPlateNumber || form.plateNumber, ownerId: customer?.customer_id || customer?.customerId || null, ownerHouseNo: customer?.houseNo || customer?.siteNo || "", status: "ACTIVE", source: "REAL" });
    setRefresh((value) => value + 1);
    setStatus(isInvitation ? "Invitation created in the live registry." : "Permission granted in the live registry.");
  };
  const updateStart = (startAt, duration = form.duration) => setForm({ ...form, startAt, endAt: startAt && Number(duration) > 0 ? toDateTimeLocal(new Date(new Date(startAt).getTime() + Number(duration) * 60000)) : form.endAt });
  const customerMatches = customerQuery.length > 1 ? vehicles.filter((vehicle) => [vehicle.ownerName, vehicle.ownerPhone, vehicle.customerCode, vehicle.houseNo, vehicle.plateNumber, vehicle.ownerEmail].some((value) => String(value || "").toLowerCase().includes(customerQuery.toLowerCase()))).slice(0, 6) : [];
  return <section className="page-panel invite-page"><p className="eyebrow">Access control · Supabase registry</p><h2>{title}</h2>{status && <p className="import-status">{status}</p>}<form className="inline-form" onSubmit={save}>{isInvitation && <div className="resident-picker"><input placeholder="Customer: name, site, or vehicle" value={customerQuery} onChange={(event) => { setCustomerQuery(event.target.value); setCustomer(null); }} />{customerMatches.length > 0 && <div className="suggestion-menu">{customerMatches.map((vehicle) => <button type="button" key={vehicle.id} onClick={() => { setCustomer(vehicle); setCustomerQuery(`${vehicle.ownerName} · ${vehicle.houseNo || vehicle.plateNumber}`); setForm((current) => ({ ...current, plateNumber: vehicle.plateNumber })); }}>{vehicle.ownerName}<small>{vehicle.houseNo || "Site not set"} · {vehicle.plateNumber}</small></button>)}</div>}</div>}<select value={form.plateNumber} onChange={(event) => setForm({ ...form, plateNumber: event.target.value })}>{vehicles.map((vehicle) => <option key={vehicle.id}>{vehicle.plateNumber}</option>)}</select><input placeholder={isInvitation ? "Visitor name" : "Person / holder name"} value={form.person} onChange={(event) => setForm({ ...form, person: event.target.value })} required /><Select name="purpose" value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} values={purposes} label="Purpose" />{form.purpose === "Other" && <input placeholder="Describe the purpose (required)" value={form.customPurpose} onChange={(event) => setForm({ ...form, customPurpose: event.target.value })} required />}{isInvitation ? <><input placeholder="Destination / unit" value={form.destination} onChange={(event) => setForm({ ...form, destination: event.target.value })} /><Select name="duration" value={form.duration} onChange={(event) => { const duration = event.target.value; setForm({ ...form, duration, endAt: form.startAt && Number(duration) > 0 ? toDateTimeLocal(new Date(new Date(form.startAt).getTime() + Number(duration) * 60000)) : "" }); }} values={durationOptions.map(([value, label]) => `${value}|${label}`)} label="Duration" /><input type="datetime-local" value={form.startAt} onChange={(event) => updateStart(event.target.value)} required /><input type="datetime-local" value={form.endAt} onChange={(event) => setForm({ ...form, endAt: event.target.value })} required /><input placeholder="Notes (optional)" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></> : <><input type="datetime-local" value={form.validFrom} onChange={(event) => setForm({ ...form, validFrom: event.target.value })} required /><input type="datetime-local" value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} required /></>}<button type="submit" disabled={loader}>{loader ? "Syncing..." : `Create ${title.slice(0, -1)}`}</button></form><div className="table-wrap"><table><thead><tr>{isInvitation ? <><th>Plate</th><th>Visitor</th><th>Purpose</th><th>Start</th><th>End</th><th>Duration</th><th>Invited by</th><th>Status</th></> : <><th>Plate</th><th>Person</th><th>Purpose</th><th>Valid from</th><th>Valid until</th><th>Status</th></>}</tr></thead><tbody>{items.map((item) => <tr key={item.id}><td className="plate">{item.plateNumber || item.plate_number}</td>{isInvitation ? <><td>{item.visitorName || item.person || "—"}</td><td>{item.purpose || "—"}</td><td>{item.startAt || item.start_at ? new Date(item.startAt || item.start_at).toLocaleString() : "—"}</td><td>{item.endAt || item.end_at ? new Date(item.endAt || item.end_at).toLocaleString() : "—"}</td><td>{item.duration ? `${item.duration} min` : "—"}</td><td>{item.invitedBy || item.invited_by_role || "—"}</td></> : <><td>{item.person || "—"}</td><td>{item.purpose || "—"}</td><td>{item.validFrom || item.valid_from ? new Date(item.validFrom || item.valid_from).toLocaleString() : "—"}</td><td>{item.validUntil || item.valid_until ? new Date(item.validUntil || item.valid_until).toLocaleString() : "—"}</td></>}<td><span className={`badge ${cls(item.status)}`}>{item.status}</span></td></tr>)}</tbody></table>{!items.length && <div className="empty">No {title.toLowerCase()} in the registry yet. Create one above.</div>}</div></section>;
}
function AccessManager({ title, collection, createItem, vehicles }) {
  const isInvitation = title === "Invitations";
  const purposes = ["Guest Visit", "Family / Relative", "Friend", "Delivery", "Food Delivery", "Courier", "Maintenance", "Electrician", "Plumber", "Driver", "Domestic Service", "Contractor", "Employee", "Student", "Faculty", "Staff", "Event", "Medical", "Emergency", "Official Visit", "Other"];
  const [form, setForm] = useState({ plateNumber: "", ownerPlateNumber: vehicles[0]?.plateNumber || "", person: "", purpose: "Guest Visit", customPurpose: "", duration: "60", startAt: "", endAt: "", validFrom: "", validUntil: "", destination: "", notes: "" });
  const [customerQuery, setCustomerQuery] = useState("");
  const [customer, setCustomer] = useState(null);
  const [items, setItems] = useState(() => getCollection(collection));
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const refresh = async () => { setLoading(true); const data = await fetchCollectionFromAPI(collection); setItems(data); setLoading(false); };
  useEffect(() => { refresh(); }, [collection]);
  const matches = customerQuery.length > 1 ? vehicles.filter((vehicle) => [vehicle.ownerName, vehicle.ownerPhone, vehicle.customerCode, vehicle.houseNo, vehicle.plateNumber, vehicle.ownerEmail].some((value) => String(value || "").toLowerCase().includes(customerQuery.toLowerCase()))).slice(0, 6) : [];
  const submit = async (event) => {
    event.preventDefault();
    if (!form.plateNumber || !form.person || !form.purpose) return setStatus("Visitor plate, visitor name, and purpose are required.");
    if (form.purpose === "Other" && !form.customPurpose.trim()) return setStatus("Describe the purpose.");
    if (isInvitation && (!form.startAt || !form.endAt || new Date(form.endAt) <= new Date(form.startAt))) return setStatus("Invitation start and end times are required.");
    if (!isInvitation && (!form.validFrom || !form.validUntil || new Date(form.validUntil) <= new Date(form.validFrom))) return setStatus("Permission validity dates are required.");
    setLoading(true);
    try {
      await createItem({ ...form, plateNumber: normalizePlate(form.plateNumber), ownerPlateNumber: normalizePlate(form.ownerPlateNumber || form.plateNumber), ownerId: customer?.customer_id || customer?.customerId || null, person: form.person.trim(), purpose: form.purpose === "Other" ? form.customPurpose.trim() : form.purpose, purposeDescription: form.purpose === "Other" ? form.customPurpose.trim() : "", ownerHouseNo: customer?.houseNo || "", status: "ACTIVE", source: "REAL" });
      setStatus(`${title.slice(0, -1)} created in the live registry.`);
      setForm({ plateNumber: "", ownerPlateNumber: customer?.plateNumber || vehicles[0]?.plateNumber || "", person: "", purpose: "Guest Visit", customPurpose: "", duration: "60", startAt: "", endAt: "", validFrom: "", validUntil: "", destination: "", notes: "" });
      await refresh();
    } catch (error) { setStatus(error.message || "Could not save to the live registry."); setLoading(false); }
  };
  return <section className="page-panel invite-page"><p className="eyebrow">Access control · Supabase registry</p><h2>{title}</h2>{status && <p className="import-status">{status}</p>}<form className="form-grid" onSubmit={submit}>{isInvitation && <label>Resident or address<input value={customerQuery} onChange={(event) => { setCustomerQuery(event.target.value); setCustomer(null); }} placeholder="Search customer, site, or registered plate" />{matches.length > 0 && <div className="suggestion-menu">{matches.map((vehicle) => <button type="button" key={vehicle.id} onClick={() => { setCustomer(vehicle); setCustomerQuery(`${vehicle.ownerName} · ${vehicle.houseNo || vehicle.plateNumber}`); setForm((current) => ({ ...current, ownerPlateNumber: vehicle.plateNumber })); }}>{vehicle.ownerName}<small>{vehicle.houseNo || "Site not set"} · {vehicle.plateNumber}</small></button>)}</div>}</label>}<label>{isInvitation ? "Visitor vehicle number" : "Vehicle number"}<input value={form.plateNumber} onChange={(event) => setForm({ ...form, plateNumber: normalizePlate(event.target.value) })} placeholder="AP28XY4567" required />{isInvitation && <small className="muted-sm">Unknown vehicles are authorized only inside this invitation window.</small>}</label>{isInvitation && <label>Resident vehicle / address reference<input value={form.ownerPlateNumber} onChange={(event) => setForm({ ...form, ownerPlateNumber: normalizePlate(event.target.value) })} placeholder="Registered resident plate" required /></label>}<label>{isInvitation ? "Visitor name" : "Person / holder name"}<input value={form.person} onChange={(event) => setForm({ ...form, person: event.target.value })} required /></label><Select name="purpose" value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} values={purposes} label="Purpose" />{form.purpose === "Other" && <label>Purpose details<input value={form.customPurpose} onChange={(event) => setForm({ ...form, customPurpose: event.target.value })} required /></label>}{isInvitation ? <><label>Start<input type="datetime-local" value={form.startAt} onChange={(event) => setForm({ ...form, startAt: event.target.value })} required /></label><label>End<input type="datetime-local" value={form.endAt} onChange={(event) => setForm({ ...form, endAt: event.target.value })} required /></label><label>Destination<input value={form.destination} onChange={(event) => setForm({ ...form, destination: event.target.value })} required /></label></> : <><label>Valid from<input type="datetime-local" value={form.validFrom} onChange={(event) => setForm({ ...form, validFrom: event.target.value })} required /></label><label>Valid until<input type="datetime-local" value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} required /></label></>}<label>Notes<input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label><button type="submit" disabled={loading}>{loading ? "Saving..." : `Create ${isInvitation ? "Invitation" : "Permission"}`}</button></form><div className="table-wrap"><table><thead><tr><th>Plate</th><th>Person</th><th>Purpose</th><th>Start</th><th>End</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td className="plate">{item.plateNumber || item.plate_number}</td><td>{item.visitorName || item.person || "-"}</td><td>{item.purpose || "-"}</td><td>{item.startAt || item.start_at ? new Date(item.startAt || item.start_at).toLocaleString() : "-"}</td><td>{item.endAt || item.end_at ? new Date(item.endAt || item.end_at).toLocaleString() : "-"}</td><td><span className={`badge ${cls(item.status)}`}>{item.status}</span></td></tr>)}</tbody></table>{!items.length && <div className="empty">No {title.toLowerCase()} in the registry yet.</div>}</div></section>;
}

function History({ visits, vehicles }) { return <section className="page-panel"><p className="eyebrow">Entry and exit records</p><h2>Complete visit history</h2><EventTable detections={visits.map((visit) => ({ ...visit, vehicleType: vehicles.find((v) => v.plateNumber === visit.plateNumber)?.vehicleType || "Unknown", ocrConfidence: 0, timestamp: visit.entryTime }))} /></section>; }

function Profile({ plate, vehicles, detections, nav }) {
  const vehicle = vehicles.find((item) => item.plateNumber === plate);
  const visits = getCollection("visits").filter((item) => item.plateNumber === plate);
  const vehicleDetections = getVehicleDetections(plate);
  const durations = visits.map((item) => Number(item.durationMinutes || 0)).filter(Boolean);
  const average = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  const longest = durations.length ? Math.max(...durations) : 0;
  const shortest = durations.length ? Math.min(...durations.filter(Boolean)) : 0;
  const allInvitations = getCollection("invitations").filter((item) => normalizePlate(item.plateNumber) === normalizePlate(plate));
  const activeInvitations = allInvitations.filter((item) => item.status === "ACTIVE");
  const expiredInvitations = allInvitations.filter((item) => item.status === "EXPIRED");
  const cancelledInvitations = allInvitations.filter((item) => item.status === "CANCELLED" || item.status === "BLOCKED");
  const authorizedAttempts = vehicleDetections.filter((item) => ["AUTHORIZED", "TEMPORARY"].includes(item.status) || item.decision === "AUTHORIZED").length;
  const unauthorizedAttempts = vehicleDetections.filter((item) => ["UNAUTHORIZED", "BLOCKED", "EXPIRED", "UNREGISTERED"].includes(item.status) || item.decision === "UNAUTHORIZED").length;
  const uncertainAttempts = vehicleDetections.filter((item) => ["OCR_FAILED", "OCR_UNCERTAIN", "INVALID_PLATE", "UNKNOWN"].includes(item.status)).length;
  const exportData = () => downloadCsv(`${plate}-profile.csv`, [{ plateNumber: vehicle.plateNumber, vehicleType: vehicle.vehicleType, make: vehicle.make, model: vehicle.model, color: vehicle.color, ownerName: vehicle.ownerName, ownerPhone: vehicle.ownerPhone, customerCode: vehicle.customerCode, totalVisits: visits.length, authorizedAttempts, unauthorizedAttempts }]);
  if (!vehicle) return <Placeholder page="Vehicle profile not found" vehicles={vehicles} detections={detections} />;
  return <section className="page-panel profile">
    <div className="profile-head">
      <div><p className="eyebrow">Vehicle profile · {vehicle.source || "REAL"}</p><h2>{vehicle.plateNumber}</h2><span className={`badge ${cls(vehicle.status)}`}>{vehicle.status}</span></div>
      <div className="actions"><button onClick={() => nav("Vehicles")}>Back to vehicles</button><button onClick={exportData}>Export CSV</button></div>
    </div>
    <div className="profile-grid">
      <Info title="Identity" values={[["Vehicle ID", vehicle.vehicleId || vehicle.id || "-"], ["Plate number", vehicle.plateNumber], ["Customer ID", vehicle.customerCode || vehicle.customer_id || "-"], ["Owner / customer", vehicle.ownerName], ["Destination / unit", vehicle.houseNo || "-"]]} />
      <Info title="Vehicle" values={[["Type", vehicle.vehicleType], ["Make", vehicle.make || "-"], ["Model", vehicle.model || "-"], ["Color", vehicle.color || "-"], ["Purpose", vehicle.purpose || "-"]]} />
      <Info title="Driver" values={[["Driver name", vehicle.driverName || "-"], ["Driver phone", vehicle.driverPhone || "-"], ["Owner phone", vehicle.ownerPhone || "-"], ["Email", vehicle.ownerEmail || "-"]]} />
      <Info title="Access" values={[["Registration", vehicle.status || "-"], ["Access type", vehicle.accessType || "-"], ["Permission", vehicle.permissionStatus || (vehicle.status === "AUTHORIZED" ? "Valid" : vehicle.status)], ["Valid from", vehicle.validFrom ? new Date(vehicle.validFrom).toLocaleDateString() : "-"], ["Valid until", vehicle.validUntil ? new Date(vehicle.validUntil).toLocaleDateString() : "-"]]} />
      <Info title="Activity" values={[["Total visits", visits.length], ["Total detections", vehicleDetections.length], ["First seen", visits.at(-1)?.entryTime ? new Date(visits.at(-1).entryTime).toLocaleDateString() : "-"], ["Last seen", visits[0]?.entryTime ? new Date(visits[0].entryTime).toLocaleDateString() : "-"], ["Average stay", average ? `${Math.floor(average / 60)}h ${average % 60}m` : "-"], ["Longest stay", longest ? `${Math.floor(longest / 60)}h ${longest % 60}m` : "-"], ["Shortest stay", shortest ? `${shortest} min` : "-"]]} />
      <Info title="Authorization attempts" values={[["Authorized", authorizedAttempts], ["Unauthorized", unauthorizedAttempts], ["Uncertain / OCR failed", uncertainAttempts], ["Registered on", vehicle.created_at || vehicle.createdAt ? new Date(vehicle.created_at || vehicle.createdAt).toLocaleDateString() : "-"], ["Last updated", vehicle.updated_at || vehicle.updatedAt ? new Date(vehicle.updated_at || vehicle.updatedAt).toLocaleDateString() : "-"]]} />
    </div>
    {allInvitations.length > 0 && <div className="history-block"><div className="section-heading"><h2>Invitations</h2><span>{allInvitations.length} total · {activeInvitations.length} active</span></div><div className="table-wrap"><table><thead><tr><th>Visitor</th><th>Purpose</th><th>Start</th><th>End</th><th>Status</th><th>Invited by</th></tr></thead><tbody>{allInvitations.slice(0, 10).map((inv) => <tr key={inv.id}><td>{inv.person || "-"}</td><td>{inv.purpose || "-"}</td><td>{inv.startAt ? new Date(inv.startAt).toLocaleString() : "-"}</td><td>{inv.endAt ? new Date(inv.endAt).toLocaleString() : "-"}</td><td><span className={`badge ${cls(inv.status)}`}>{inv.status}</span></td><td>{inv.createdBy || "-"}</td></tr>)}</tbody></table></div></div>}
    <div className="history-block"><div className="section-heading"><h2>Visit history</h2><span>{visits.length} visits</span></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Entry</th><th>Exit</th><th>Duration</th><th>Status</th></tr></thead><tbody>{visits.slice(0, 15).map((visit) => <tr key={visit.id}><td>{visit.entryTime ? new Date(visit.entryTime).toLocaleDateString() : "-"}</td><td>{visit.entryTime ? clock(visit.entryTime) : "-"}</td><td>{visit.exitTime ? clock(visit.exitTime) : <span className="muted-sm">Inside</span>}</td><td>{visit.durationMinutes ? `${Math.floor(visit.durationMinutes / 60)}h ${visit.durationMinutes % 60}m` : "Open"}</td><td><span className={`badge ${cls(visit.status || visit.authorization_status)}`}>{visit.status || visit.authorization_status || "-"}</span></td></tr>)}</tbody></table>{!visits.length && <div className="empty">No visit history yet.</div>}</div></div>
    <div className="history-block"><div className="section-heading"><h2>Recent detections</h2><span>{vehicleDetections.length} total</span></div><EventTable detections={vehicleDetections.slice(0, 10)} /></div>
  </section>;
}
function Info({ title, values }) { return <div className="info-card"><p className="eyebrow">{title}</p>{values.map(([label, value]) => <div className="info-row" key={label}><span>{label}</span><strong>{value || "-"}</strong></div>)}</div>; }
function Analytics({ vehicles, visits, detections }) { const byType = vehicles.reduce((result, vehicle) => { const type = vehicle.vehicleType || "Unknown"; return { ...result, [type]: (result[type] || 0) + 1 }; }, {}); const authorized = detections.filter((item) => ["AUTHORIZED", "TEMPORARY"].includes(item.status) || item.decision === "AUTHORIZED").length; const unauthorized = detections.filter((item) => ["UNAUTHORIZED", "BLOCKED", "EXPIRED", "UNREGISTERED"].includes(item.status) || item.decision === "UNAUTHORIZED").length; const pending = Math.max(0, detections.length - authorized - unauthorized); const total = Math.max(authorized + unauthorized + pending, 1); const angle = Math.round((authorized / total) * 360); return <section className="page-panel analytics-page"><div className="section-heading"><div><p className="eyebrow">From the Supabase vehicle registry</p><h2>Traffic patterns</h2><small className="muted-sm">Generated {new Date().toLocaleString()}</small></div><div className="actions"><button onClick={() => window.print()}>Print / PDF</button></div></div><div className="analytics-grid"><Info title="System totals" values={[["Vehicles", vehicles.length], ["Visits", visits.length], ["Detections", detections.length], ["Average stay", `${Math.round(visits.reduce((sum, item) => sum + Number(item.durationMinutes || 0), 0) / Math.max(visits.length, 1))} minutes`]]} /><Info title="Vehicle types" values={Object.entries(byType).slice(0, 8)} /><div className="info-card authorization-card"><p className="eyebrow">Authorization pattern</p><div className="donut" style={{ background: `conic-gradient(var(--green) 0deg ${angle}deg, var(--red) ${angle}deg ${angle + Math.round((unauthorized / total) * 360)}deg, var(--yellow) ${angle + Math.round((unauthorized / total) * 360)}deg 360deg)` }}><strong>{detections.length}</strong><small>events</small></div><div className="donut-legend"><span><i className="dot green" />Authorized {authorized}</span><span><i className="dot red" />Unauthorized {unauthorized}</span><span><i className="dot yellow" />Pending {pending}</span></div></div></div><div className="bar-chart">{Object.entries(byType).map(([label, value]) => <div className="bar-row" key={label}><span>{label}</span><i style={{ width: `${Math.min(value * 5, 100)}%` }} /><strong>{value}</strong></div>)}</div></section>; }
function ReportsLegacy({ vehicles, visits, detections }) {
  const [filter, setFilter] = useState({ from: "", to: "", type: "", status: "", purpose: "" });
  const inRange = (date) => { const value = String(date || "").slice(0, 10); return (!filter.from || value >= filter.from) && (!filter.to || value <= filter.to); };
  const filteredVisits = visits.filter((visit) => { const vehicle = vehicles.find((item) => item.plateNumber === visit.plateNumber); return inRange(visit.entryTime) && (!filter.type || (vehicle?.vehicleType || "Unknown") === filter.type) && (!filter.status || visit.status === filter.status) && (!filter.purpose || visit.purpose === filter.purpose); });
  const filteredDetections = detections.filter((event) => { const vehicle = vehicles.find((item) => item.plateNumber === event.plateNumber); return inRange(event.timestamp) && (!filter.type || (vehicle?.vehicleType || event.vehicleType || "Unknown") === filter.type) && (!filter.status || event.status === filter.status); });
  const authorizedCount = filteredDetections.filter((d) => ["AUTHORIZED", "TEMPORARY"].includes(d.status) || d.decision === "AUTHORIZED").length;
  const unauthorizedCount = filteredDetections.filter((d) => ["UNAUTHORIZED", "BLOCKED", "EXPIRED", "UNREGISTERED"].includes(d.status) || d.decision === "UNAUTHORIZED").length;
  const uncertainCount = filteredDetections.filter((d) => ["OCR_FAILED", "OCR_UNCERTAIN", "INVALID_PLATE", "UNKNOWN"].includes(d.status)).length;
  const exportReport = () => downloadCsv("filtered-report.csv", filteredVisits.map((visit) => { const vehicle = vehicles.find((item) => item.plateNumber === visit.plateNumber); return { plate: visit.plateNumber, owner: vehicle?.ownerName || "Unknown", vehicleType: vehicle?.vehicleType || "Unknown", customerCode: vehicle?.customerCode || "", purpose: visit.purpose || "", entryTime: visit.entryTime, exitTime: visit.exitTime || "", duration: visit.durationMinutes || "", status: visit.status }; }));
  const types = [...new Set(vehicles.map((item) => item.vehicleType || "Unknown"))];
  const statuses = [...new Set([...visits, ...detections].map((item) => item.status).filter(Boolean))];
  return <section className="page-panel reports-page"><p className="eyebrow">Reports</p><h2>Filtered visit report</h2><div className="filter-grid"><label>From<input type="date" value={filter.from} onChange={(event) => setFilter({ ...filter, from: event.target.value })} /></label><label>To<input type="date" value={filter.to} onChange={(event) => setFilter({ ...filter, to: event.target.value })} /></label><label>Vehicle type<select value={filter.type} onChange={(event) => setFilter({ ...filter, type: event.target.value })}><option value="">All types</option>{types.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><label>Status<select value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value })}><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label></div><div className="report-summary" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginTop: 16 }}><div className="info-card" style={{ padding: 14 }}><p className="eyebrow">Visits</p><strong style={{ fontSize: 22, fontFamily: "var(--font-mono)" }}>{filteredVisits.length}</strong></div><div className="info-card" style={{ padding: 14 }}><p className="eyebrow">Authorized</p><strong style={{ fontSize: 22, fontFamily: "var(--font-mono)", color: "var(--green)" }}>{authorizedCount}</strong></div><div className="info-card" style={{ padding: 14 }}><p className="eyebrow">Unauthorized</p><strong style={{ fontSize: 22, fontFamily: "var(--font-mono)", color: "var(--red)" }}>{unauthorizedCount}</strong></div><div className="info-card" style={{ padding: 14 }}><p className="eyebrow">Uncertain</p><strong style={{ fontSize: 22, fontFamily: "var(--font-mono)", color: "var(--amber)" }}>{uncertainCount}</strong></div><div className="info-card" style={{ padding: 14 }}><p className="eyebrow">Detections</p><strong style={{ fontSize: 22, fontFamily: "var(--font-mono)" }}>{filteredDetections.length}</strong></div></div><div className="form-footer"><span>{filteredVisits.length} filtered visit records</span><div className="actions"><button onClick={exportReport}>Export CSV</button><button onClick={() => window.print()}>Print / PDF</button></div></div>{filteredVisits.length ? <div className="table-wrap"><table><thead><tr><th>Plate</th><th>Owner</th><th>Type</th><th>Customer</th><th>Entry</th><th>Exit</th><th>Duration</th><th>Status</th></tr></thead><tbody>{filteredVisits.map((visit) => { const vehicle = vehicles.find((item) => item.plateNumber === visit.plateNumber); return <tr key={visit.id}><td className="plate">{visit.plateNumber}</td><td>{vehicle?.ownerName || "Unknown"}</td><td>{vehicle?.vehicleType || "Unknown"}</td><td>{vehicle?.customerCode || "-"}</td><td>{visit.entryTime ? new Date(visit.entryTime).toLocaleString() : "-"}</td><td>{visit.exitTime ? new Date(visit.exitTime).toLocaleString() : "Inside"}</td><td>{visit.durationMinutes ? `${visit.durationMinutes} min` : "-"}</td><td><span className={`badge ${cls(visit.status)}`}>{visit.status}</span></td></tr>; })}</tbody></table></div> : <div className="empty">No records match the current filters.</div>}</section>;
}
function Reports({ vehicles, visits }) {
  const [filter, setFilter] = useState({ from: "", to: "", type: "" });
  const filtered = visits.filter((visit) => { const row = visitRow(visit, vehicles); const day = String(row.entry || "").slice(0, 10); return (!filter.from || day >= filter.from) && (!filter.to || day <= filter.to) && (!filter.type || row.vehicleType === filter.type); });
  const types = [...new Set(vehicles.map((vehicle) => vehicle.vehicleType || "Unknown"))];
  return <section className="page-panel reports-page"><div className="section-heading"><div><p className="eyebrow">Live report workspace</p><h2>Vehicle and visit report</h2></div><span className="table-count">{filtered.length} filtered visits</span></div><div className="filter-grid"><label>From<input type="date" value={filter.from} onChange={(event) => setFilter({ ...filter, from: event.target.value })} /></label><label>To<input type="date" value={filter.to} onChange={(event) => setFilter({ ...filter, to: event.target.value })} /></label><label>Vehicle type<select value={filter.type} onChange={(event) => setFilter({ ...filter, type: event.target.value })}><option value="">All types</option>{types.map((type) => <option key={type} value={type}>{type}</option>)}</select></label></div><VehicleVisitTable visits={filtered} vehicles={vehicles} title="Filtered vehicle activity" /></section>;
}
function Diagnostics({ cameraOn, toggleCamera, aiOnline }) { return <section className="page-panel"><p className="eyebrow">System diagnostics</p><h2>Input health</h2><div className="diagnostic-grid"><Info title="Camera" values={[["Status", cameraOn ? "ON" : "OFF"], ["Source", "Browser webcam (getUserMedia)"], ["Facing", "User (front-facing)"]]} /><Info title="AI Engine" values={[["Status", aiOnline ? "Online" : "Offline"], ["Endpoint", "http://localhost:5001"], ["Pipeline", "YOLO > Plate Detection > EasyOCR > Validation"], ["Model", "yolo11n.pt (vehicle) + trained plate detector"]]} /><Info title="Backend" values={[["API", "http://localhost:4000"], ["Database", "Supabase PostgreSQL"], ["WebSocket", "Real-time event streaming"], ["Auth", "Supabase Auth + JWT"]]} /><Info title="System" values={[["Mode", cameraOn ? "Live capture" : "Idle"], ["AI processing", aiOnline ? "Active" : "Waiting for Python AI service"], ["Frame interval", "1.5 seconds"], ["Frame format", "JPEG base64"]]} /></div><button onClick={toggleCamera}>{cameraOn ? "Turn camera off" : "Turn camera on"}</button><p className="muted-note">Camera status reflects actual browser webcam state. AI engine status reflects actual Python service connectivity. Nothing is simulated or faked.</p></section>; }
function downloadCsv(name, rows) { const headers = Object.keys(rows[0] || { result: "No records" }); const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => JSON.stringify(row[header] ?? "")).join(","))].join("\n"); const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = name; link.click(); URL.revokeObjectURL(link.href); }
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === "\"") { if (text[i + 1] === "\"") { field += "\""; i += 1; } else quoted = false; }
      else field += char;
    } else if (char === "\"") quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") { rows.push(row); row = []; }
    } else field += char;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => headers.reduce((object, header, index) => { if (header) object[header] = (cells[index] || "").trim(); return object; }, {}));
}

const vehicleMarks = [["SEDAN", CarFront], ["SUV", Car], ["MOTORCYCLE", Bike], ["COMMERCIAL", Truck], ["LOGISTICS", Truck], ["EMERGENCY", Gauge], ["EV CAR", CarFront]];

function LogoMark({ theme = "customer", size = 48 }) {
  const [index, setIndex] = useState(0);
  const prefersReduced = useReducedMotion();
  useEffect(() => {
    if (prefersReduced) return undefined;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % vehicleMarks.length), 1600);
    return () => window.clearInterval(timer);
  }, [prefersReduced]);
  const VehicleIcon = vehicleMarks[index][1];
  return (
    <span className={`logo-mark ${theme}`} style={{ width: size, height: size }} aria-label="NexPlate logo">
      <span className="logo-vehicle">
        <VehicleIcon size={Math.round(size * 0.88)} strokeWidth={2.4} />
      </span>
    </span>
  );
}

function VehicleRotator() {
  const [index, setIndex] = useState(0);
  const prefersReduced = useReducedMotion();
  useEffect(() => {
    if (prefersReduced) return undefined;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % vehicleMarks.length), 1800);
    return () => window.clearInterval(timer);
  }, [prefersReduced]);
  const [label, Icon] = vehicleMarks[index];
  return <div className="gate-sequence"><AnimatePresence mode="popLayout"><motion.div key={label} className="gate-slide" initial={prefersReduced ? false : { x: 90, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={prefersReduced ? undefined : { x: -90, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }}><Icon size={76} strokeWidth={1.4} /><span>{label}</span></motion.div></AnimatePresence></div>;
}

function Scramble({ text, delay = 0, duration = 1, className = "" }) {
  const prefersReduced = useReducedMotion();
  const [value, setValue] = useState("");
  useEffect(() => {
    if (prefersReduced) { setValue(text); return undefined; }
    let timer = 0;
    let handle = 0;
    let frame = 0;
    const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@";
    timer = window.setTimeout(() => {
      const rate = Math.max(2, Math.round((duration * 1000) / 16 / Math.max(text.length, 1)));
      const tick = () => {
        frame += 1;
        const shown = Math.min(text.length, Math.floor(frame / rate));
        setValue(text.split("").map((char, index) => (index < shown || char === " " ? char : glyphs[(Math.random() * glyphs.length) | 0])).join(""));
        if (shown < text.length) { handle = requestAnimationFrame(tick); } else { setValue(text); }
      };
      handle = requestAnimationFrame(tick);
    }, delay);
    return () => { window.clearTimeout(timer); cancelAnimationFrame(handle); };
  }, [text, delay, duration, prefersReduced]);
  return <span className={className}>{value}</span>;
}

function PlateTicker({ plates }) {
  const items = plates.length ? plates : ["AWAITING LIVE SIGNAL"];
  return <div className="plate-ticker" aria-hidden="true"><div className="plate-ticker-track">{items.map((plate, index) => <span className="tick-chip" key={index}>{plate}</span>)}</div></div>;
}

createRoot(document.getElementById("root")).render(<App />);
