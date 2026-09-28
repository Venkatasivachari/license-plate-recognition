const keys = ["vehicles", "owners", "drivers", "permissions", "invitations", "visits", "detections", "alerts", "accounts", "passwordResetRequests", "complaints", "settings"];
const read = (key) => JSON.parse(localStorage.getItem(key) || "[]");
const write = (key, value) => { localStorage.setItem(key, JSON.stringify(value)); window.dispatchEvent(new Event("local-data-change")); return value; };
export const normalizePlate = (value) => String(value || "").replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 10);
export const isIndianPlateFormat = (value) => /^(AP|AR|AS|BR|CG|DL|GA|GJ|HR|HP|JK|JH|KA|KL|MP|MH|MN|OD|PB|RJ|SK|TN|TS|TR|UP|UK|WB)\d{1,2}[A-Z]{1,3}\d{1,4}$/.test(normalizePlate(value));
const normalizeRecordPlate = (value) => value && value.plateNumber ? { ...value, plateNumber: normalizePlate(value.plateNumber), ...(value.ownerPlateNumber ? { ownerPlateNumber: normalizePlate(value.ownerPlateNumber) } : {}) } : value;
const create = (key, value) => { const item = { id: `${key.slice(0, 2).toUpperCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, createdAt: new Date().toISOString(), ...normalizeRecordPlate(value) }; return write(key, [item, ...read(key)]); };

const API_BASE = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "http://localhost:4000";

let session = null;
export const setSession = (value) => { session = value || null; };
export const getSession = () => session;
export const getAccessToken = () => session?.access_token || null;
export const getRefreshToken = () => session?.refresh_token || null;

export function generateCustomerCode() {
  const counter = Number(localStorage.getItem("customerCodeCounter") || "0") + 1;
  localStorage.setItem("customerCodeCounter", String(counter));
  return `CUST-${String(counter).padStart(5, "0")}`;
}

const ApiError = (status, message) => { const error = new Error(message); error.status = status; return error; };

async function tryRefresh() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const response = await fetch(`${API_BASE}/api/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: refreshToken }) });
    if (!response.ok) { setSession(null); return false; }
    const data = await response.json();
    session = { ...session, access_token: data.access_token, refresh_token: data.refresh_token };
    return true;
  } catch {
    return false;
  }
}

async function apiFetch(path, options = {}, attempt = 0) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 401 && attempt === 0 && (await tryRefresh())) return apiFetch(path, options, 1);
  if (response.status === 204) return null;
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try { const body = await response.json(); if (body?.error) message = body.error; } catch {}
    throw ApiError(response.status, message);
  }
  return response.json();
}

export async function apiLogin(username, password, role) {
  const data = await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password, role }) });
  setSession(data);
  return data;
}

export function apiLogout() { setSession(null); return true; }

const types = ["Sedan", "Hatchback", "Motorcycle", "Electric Scooter", "SUV", "Van", "Heavy Commercial", "Logistics Carrier", "Bus", "Multi-Utility Vehicle", "Emergency Vehicle", "Other", "Unknown"];
const purposes = ["Guest Visit", "Family / Relative", "Friend", "Delivery", "Food Delivery", "Courier", "Maintenance", "Electrician", "Plumber", "Driver", "Domestic Service", "Contractor", "Employee", "Student", "Faculty", "Staff", "Event", "Medical", "Emergency", "Official Visit", "Other"];
const names = ["Ravi Kumar", "Anita Sharma", "Suresh Reddy", "Meena Patel", "Arjun Rao", "Priya Nair", "Vikram Singh", "Kavya Das", "Nikhil Varma", "Lakshmi Iyer"];
const makes = ["Hyundai", "Honda", "Tata", "Maruti", "Toyota", "Mahindra", "Kia", "Ford", "Bajaj", "Ashok Leyland"];
const colors = ["White", "Silver", "Black", "Blue", "Red", "Grey"];
const statuses = ["AUTHORIZED", "AUTHORIZED", "TEMPORARY", "EXPIRED", "BLOCKED"];
const demoVehicles = Array.from({ length: 30 }, (_, index) => ({
  id: `DEMO-${String(index + 1).padStart(3, "0")}`, plateNumber: `${["AP", "TS", "KA", "TN"][index % 4]}${String((index % 38) + 1).padStart(2, "0")}${String.fromCharCode(65 + index % 26)}${String.fromCharCode(66 + (index * 3) % 24)}${String(1200 + index * 137).slice(-4)}`,
  vehicleType: types[index % types.length], make: makes[index % makes.length], model: ["Creta", "Activa", "Nexon", "Swift", "Innova", "Bolero"][index % 6], color: colors[index % colors.length], ownerName: names[index % names.length], ownerPhone: `98765${String(10000 + index * 317).slice(-5)}`, driverName: names[(index + 3) % names.length], driverPhone: `98660${String(20000 + index * 271).slice(-5)}`, purpose: purposes[index % purposes.length], accessType: index % 3 === 0 ? "Permanent" : "Temporary", status: statuses[index % statuses.length], demoData: true, createdAt: new Date(Date.now() - index * 86400000).toISOString()
}));

export function seedDemoData() {
  if (!localStorage.getItem("settings")) write("settings", [{ id: "settings", cameraEnabled: false, demoMode: false }]);
  for (const key of ["vehicles", "permissions", "invitations", "visits", "detections", "alerts"]) { const records = read(key); const normalized = records.map(normalizeRecordPlate); if (JSON.stringify(records) !== JSON.stringify(normalized)) write(key, normalized); }
}
export function generateSampleData(amount = 30) {
  const count = Math.max(1, Math.min(Number(amount) || 30, 100));
  const stamp = Date.now();
  const generated = Array.from({ length: count }, (_, index) => ({ ...demoVehicles[(index + stamp) % demoVehicles.length], id: `DEMO-${stamp}-${index}`, plateNumber: `${["AP", "TS", "KA", "TN"][index % 4]}${String((index % 38) + 1).padStart(2, "0")}${String.fromCharCode(65 + (index * 7) % 26)}${String.fromCharCode(66 + (index * 11) % 24)}${String(1000 + Math.floor(Math.random() * 8999))}`, demoData: true, source: "DEMO", createdAt: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString() }));
  write("vehicles", [...generated, ...read("vehicles")]);
  write("visits", [...generated.slice(0, Math.min(count, 20)).map((vehicle, index) => ({ id: `VIS-${stamp}-${index}`, plateNumber: vehicle.plateNumber, entryTime: new Date(Date.now() - (index + 1) * 86400000 - 3600000).toISOString(), exitTime: new Date(Date.now() - (index + 1) * 86400000).toISOString(), durationMinutes: 60 + index * 17, status: vehicle.status, source: "DEMO" })), ...read("visits")]);
  write("detections", [...generated.slice(0, Math.min(count, 20)).map((vehicle, index) => ({ id: `DET-${stamp}-${index}`, plateNumber: vehicle.plateNumber, vehicleType: vehicle.vehicleType, status: vehicle.status, ocrConfidence: 0.82 + (index % 16) / 100, source: "DEMO", timestamp: vehicle.createdAt })), ...read("detections")]);
  write("alerts", [...generated.filter((vehicle) => ["BLOCKED", "EXPIRED"].includes(vehicle.status)).map((vehicle, index) => ({ id: `ALT-${stamp}-${index}`, plateNumber: vehicle.plateNumber, type: vehicle.status, message: `${vehicle.status} sample vehicle requires review`, read: false, source: "DEMO", timestamp: vehicle.createdAt })), ...read("alerts")]);
  return generated;
}
export function clearDemoData() { for (const key of ["vehicles", "visits", "detections", "alerts", "permissions", "invitations", "accounts"]) write(key, read(key).filter((item) => item.id === "ACC-ADMIN" || (item.source !== "DEMO" && !item.demoData))); }
export const getCollection = (key) => read(key);

// ============================================================
// COLLECTIONS - API-first with localStorage fallback
// ============================================================
export async function fetchCollectionFromAPI(key) {
  if (!getAccessToken()) return read(key);
  const apiMap = { detections: "/api/events?limit=1000", visits: "/api/visits?limit=1000", invitations: "/api/invitations", alerts: "/api/alerts?limit=1000", permissions: "/api/permissions", complaints: "/api/complaints" };
  const path = apiMap[key];
  if (!path) return read(key);
  try {
    const data = await apiFetch(path);
    write(key, data);
    return data;
  } catch (error) {
    console.error(`Failed to fetch ${key} from API:`, error);
    return read(key);
  }
}

// ============================================================
// VEHICLES - API-first with localStorage fallback
// ============================================================
export function getVehiclesSync() { return read("vehicles"); }

export async function getVehicles() {
  if (getAccessToken()) {
    try {
      const data = await apiFetch("/api/vehicles");
      write("vehicles", data);
      return data;
    } catch (error) {
      console.error("Failed to fetch vehicles from API, falling back to localStorage:", error);
    }
  }
  return read("vehicles");
}

export async function getVehicleById(id) {
  if (getAccessToken()) {
    try {
      const data = await apiFetch(`/api/vehicles/${id}`);
      return data;
    } catch (error) {
      console.error("Failed to fetch vehicle by ID:", error);
    }
  }
  return getVehiclesSync().find((vehicle) => vehicle.id === id);
}

export async function getVehicleByPlate(plate) {
  const normalized = normalizePlate(plate);
  if (getAccessToken()) {
    try {
      const data = await apiFetch(`/api/vehicles/${normalized}`);
      return data;
    } catch (error) {
      if (error.status === 404) return null;
      console.error("Failed to fetch vehicle by plate:", error);
    }
  }
  return getVehiclesSync().find((vehicle) => vehicle.plateNumber?.toLowerCase() === normalized.toLowerCase());
}

export async function searchVehicles(query) {
  const normalized = normalizePlate(String(query).trim());
  const term = String(query).toLowerCase();

  if (getAccessToken()) {
    try {
      const data = await apiFetch(`/api/vehicles?search=${encodeURIComponent(term)}`);
      write("vehicles", data);
      return data.map((v) => ({ ...v, plateNumber: v.plate_number, vehicleType: v.vehicle_type, ownerName: v.owner_name, houseNo: v.house_no, customerCode: v.customer_code }));
    } catch (error) {
      console.error("Failed to search vehicles via API:", error);
    }
  }

  return searchVehiclesSync(query);
}

export function searchVehiclesSync(query) {
  const normalized = normalizePlate(String(query).trim());
  const term = String(query).toLowerCase();
  const all = read("vehicles");
  if (!term) return all;
  const exact = normalized ? all.filter((v) => normalizePlate(v.plateNumber) === normalized) : [];
  const rest = all.filter((v) => {
    if (exact.includes(v)) return false;
    const fields = [v.plateNumber, v.ownerName, v.customerCode, v.customer_id, v.ownerPhone, v.ownerEmail, v.driverName, v.driverPhone, v.vehicleType, v.purpose, v.status, v.houseNo, v.make, v.model, v.color, v.accessType];
    const hay = fields.map((f) => String(f || "").toLowerCase()).join(" ");
    if (term && hay.includes(term)) return true;
    if (normalized && normalizePlate(v.plateNumber).includes(normalized)) return true;
    return false;
  });
  const invites = term ? read("invitations").filter((inv) => String(inv.plateNumber || "").toLowerCase().includes(term) || String(inv.person || "").toLowerCase().includes(term)) : [];
  const invitePlates = new Set(invites.map((inv) => normalizePlate(inv.plateNumber)));
  const scored = rest.sort((a, b) => {
    const aHasInvite = invitePlates.has(normalizePlate(a.plateNumber)) ? -1 : 0;
    const bHasInvite = invitePlates.has(normalizePlate(b.plateNumber)) ? -1 : 0;
    if (aHasInvite !== bHasInvite) return aHasInvite - bHasInvite;
    return a.plateNumber.localeCompare(b.plateNumber);
  });
  return [...exact, ...scored];
}

export async function createVehicle(vehicle, password) {
  const vehicleId = `VEH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  if (getAccessToken()) {
    try {
      const created = await apiFetch("/api/vehicles", { method: "POST", body: JSON.stringify({ ...vehicle, plateNumber: normalizePlate(vehicle.plateNumber), password }) });
      const record = { ...created, id: created.id || vehicleId, plateNumber: created.plateNumber || normalizePlate(vehicle.plateNumber), status: created.status || "AUTHORIZED", source: "REAL", demoData: false, vehicleId: created.id || vehicleId };
      write("vehicles", [record, ...read("vehicles")]);
      return record;
    } catch (error) {
      console.error("Failed to create vehicle via API:", error);
      throw error;
    }
  }
  return create("vehicles", { ...vehicle, id: vehicleId, plateNumber: normalizePlate(vehicle.plateNumber), source: "REAL", demoData: false, vehicleId });
}

export async function updateVehicle(id, changes) {
  if (getAccessToken()) {
    try {
      const data = await apiFetch(`/api/vehicles/${id}`, { method: "PATCH", body: JSON.stringify(changes) });
      write("vehicles", read("vehicles").map((vehicle) => vehicle.id === id ? { ...vehicle, ...data, updatedAt: new Date().toISOString() } : vehicle));
      return data;
    } catch (error) {
      console.error("Failed to update vehicle via API:", error);
      throw error;
    }
  }
  write("vehicles", read("vehicles").map((vehicle) => vehicle.id === id ? { ...vehicle, ...changes, updatedAt: new Date().toISOString() } : vehicle));
}

export async function blockVehicle(id) {
  const vehicle = getVehiclesSync().find((v) => v.id === id);
  if (getAccessToken() && vehicle) {
    try {
      await apiFetch(`/api/vehicles/${id}`, { method: "PATCH", body: JSON.stringify({ status: "BLOCKED" }) });
      write("vehicles", read("vehicles").map((v) => v.id === id ? { ...v, status: "BLOCKED", updatedAt: new Date().toISOString() } : v));
      return;
    } catch (error) {
      console.error("Failed to block vehicle via API:", error);
      throw error;
    }
  }
  write("vehicles", read("vehicles").map((v) => v.id === id ? { ...v, status: "BLOCKED", updatedAt: new Date().toISOString() } : v));
}

// ============================================================
// ACCOUNTS - localStorage only (for demo/fallback)
// ============================================================
export const createAccount = (account) => create("accounts", account.role === "CUSTOMER" ? { ...account, username: normalizePlate(account.username), plateNumber: normalizePlate(account.plateNumber) } : account);
export const findAccount = (username, password, role) => read("accounts").find((account) => account.username.toUpperCase() === String(username || "").trim().toUpperCase() && account.password === String(password || "").trim() && account.role === role);
export const getAccountVehicles = (account) => getVehiclesSync().filter((vehicle) => vehicle.id === account.vehicleId || vehicle.plateNumber === account.plateNumber || (account.id && vehicle.customer_id === account.id)) || [];

// ============================================================
// PERMISSIONS - API-first
// ============================================================
export async function createPermission(item) {
  if (getAccessToken()) {
    try {
      const created = await apiFetch("/api/permissions", { method: "POST", body: JSON.stringify(item) });
      const mapped = { ...created, id: created.id, plateNumber: created.plateNumber || normalizePlate(item.plateNumber), person: item.person, purpose: created.purpose || item.purpose || "Visitor", validDate: created.validDate || item.validDate, validFrom: created.validFrom || item.validFrom, validUntil: created.validUntil || item.validUntil, allowedEntryFrom: created.allowedEntryFrom || item.allowedEntryFrom, allowedEntryUntil: created.allowedEntryUntil || item.allowedEntryUntil, status: created.status || "ACTIVE", source: "REAL" };
      write("permissions", [mapped, ...read("permissions").filter((permission) => permission.id !== mapped.id)]);
      return read("permissions");
    } catch (error) {
      console.error("Failed to create permission via API, falling back to localStorage:", error);
    }
  }
  return create("permissions", item);
}

// ============================================================
// INVITATIONS - API-first
// ============================================================
export async function createInvitation(item) {
  if (getAccessToken()) {
    try {
      const created = await apiFetch("/api/invitations", { method: "POST", body: JSON.stringify(item) });
      const mapped = { ...created, id: created.id, plateNumber: created.plateNumber || normalizePlate(item.plateNumber), ownerPlateNumber: normalizePlate(item.ownerPlateNumber), createdBy: item.createdBy, person: created.person || item.person, visitorName: created.visitorName || item.visitorName || created.person || item.person, purposeDescription: created.purposeDescription || item.purposeDescription, destination: created.destination || item.destination, notes: created.notes || item.notes, invitedBy: created.invitedBy || item.invitedBy, ownerHouseNo: created.ownerHouseNo || item.ownerHouseNo, duration: created.duration || item.duration, startAt: created.startAt || item.startAt, endAt: created.endAt || item.endAt, status: created.status || "ACTIVE", source: "REAL" };
      write("invitations", [mapped, ...read("invitations")]);
      return read("invitations");
    } catch (error) {
      console.error("Failed to create invitation via API, falling back to localStorage:", error);
    }
  }
  return create("invitations", item);
}

// ============================================================
// DETECTIONS - localStorage only (written by backend)
// ============================================================
export const createDetection = (item) => create("detections", item);

// ============================================================
// VISITS - localStorage only (written by backend)
// ============================================================
export const createVisit = (item) => create("visits", item);

// ============================================================
// ALERTS - API-first for mark read
// ============================================================
export const createAlert = (item) => create("alerts", item);

export async function markAlertRead(id) {
  if (getAccessToken()) {
    try {
      await apiFetch(`/api/alerts/${id}/read`, { method: "POST" });
    } catch (error) {
      console.error("Failed to mark alert as read via API:", error);
    }
  }
  write("alerts", read("alerts").map((alert) => alert.id === id ? { ...alert, read: true } : alert));
}

// ============================================================
// ACCESS EVALUATION - API-first
// ============================================================
export async function getPlateContextAPI(plate) {
  if (!getAccessToken()) return null;
  const normalized = normalizePlate(plate);
  try {
    const [vehicleResp, invitations, sessions, visits, detections, permissions] = await Promise.all([
      apiFetch(`/api/vehicles/${normalized}`).catch(() => null),
      apiFetch(`/api/invitations`).catch(() => []),
      apiFetch(`/api/vehicle-sessions?plate_number=${normalized}&status=ALL`).catch(() => []),
      apiFetch(`/api/visits?limit=500`).catch(() => []),
      apiFetch(`/api/events?limit=500`).catch(() => []),
      apiFetch(`/api/permissions`).catch(() => []),
    ]);
    const vehicle = vehicleResp && vehicleResp.category !== "NEW VEHICLE" ? vehicleResp : null;
    const vehicleInvitations = (invitations || []).filter((inv) => normalizePlate(inv.plate_number || inv.plateNumber) === normalized);
    const vehicleVisits = (visits || []).filter((v) => normalizePlate(v.plate_number || v.plateNumber) === normalized);
    const vehicleDetections = (detections || []).filter((d) => normalizePlate(d.plate_number || d.plateNumber) === normalized);
    const vehiclePermissions = (permissions || []).filter((p) => normalizePlate(p.plate_number || p.plateNumber) === normalized);
    const access = vehicle ? await evaluateAccess(normalized) : evaluateAccessSync(normalized);
    return {
      vehicle,
      normalized,
      invitations: vehicleInvitations,
      activeInvitation: vehicleInvitations.find((inv) => inv.status === "ACTIVE" && new Date(inv.start_at || inv.startAt) <= new Date() && new Date(inv.end_at || inv.endAt) >= new Date()),
      visits: vehicleVisits.slice(0, 30),
      detections: vehicleDetections.slice(0, 30),
      permissions: vehiclePermissions,
      sessions: sessions || [],
      access,
      now: new Date().toISOString(),
    };
  } catch (error) {
    console.error("Failed to fetch plate context from API:", error);
    return null;
  }
}

export async function evaluateAccess(plate, at = new Date()) {
  const normalized = normalizePlate(plate);

  // Try API first if authenticated
  if (getAccessToken()) {
    try {
      const vehicle = await apiFetch(`/api/vehicles/${normalized}`);
      if (vehicle && vehicle.status === "BLOCKED") return { plateNumber: normalized, vehicle, invitation: null, status: "BLOCKED", decision: "UNAUTHORIZED", reason: "Vehicle is blocked" };
      const timestamp = at instanceof Date ? at.toISOString() : new Date(at).toISOString();
      if (vehicle && (!vehicle.valid_from || timestamp >= vehicle.valid_from) && (!vehicle.valid_until || timestamp <= vehicle.valid_until)) {
        return { plateNumber: normalized, vehicle, invitation: null, status: "AUTHORIZED", decision: "AUTHORIZED", reason: "Registered vehicle permission is valid" };
      }
      // Check invitations via API
      const invitations = await apiFetch(`/api/invitations?plate_number=${normalized}`);
      const invitation = invitations.find((inv) => inv.status === "ACTIVE" && new Date(inv.start_at) <= new Date(at) && new Date(inv.end_at) >= new Date(at));
      if (invitation) return { plateNumber: normalized, vehicle, invitation, status: "TEMPORARY", decision: "AUTHORIZED", reason: "Invitation is valid" };
      return { plateNumber: normalized, vehicle, invitation: null, status: vehicle ? "EXPIRED" : "UNREGISTERED", decision: "UNAUTHORIZED", reason: vehicle ? "No valid permission at this time" : "Vehicle is not registered" };
    } catch (error) {
      console.error("Failed to evaluate access via API, falling back to localStorage:", error);
    }
  }

  return evaluateAccessSync(plate, at);
}

// Synchronous access evaluation from localStorage cache
export function evaluateAccessSync(plate, at = new Date()) {
  const normalized = normalizePlate(plate);
  const timestamp = at instanceof Date ? at.getTime() : new Date(at).getTime();
  const vehicle = read("vehicles").find((v) => normalizePlate(v.plateNumber) === normalized);
  const within = (from, until) => (!from || timestamp >= new Date(from).getTime()) && (!until || timestamp <= new Date(until).getTime());
  if (vehicle && vehicle.status === "BLOCKED") return { plateNumber: normalized, vehicle, invitation: null, status: "BLOCKED", decision: "UNAUTHORIZED", reason: "Vehicle is blocked" };
  if (vehicle && within(vehicle.validFrom, vehicle.validUntil)) return { plateNumber: normalized, vehicle, invitation: null, status: "AUTHORIZED", decision: "AUTHORIZED", reason: "Registered vehicle permission is valid" };
  const invitation = read("invitations").find((item) => normalizePlate(item.plateNumber) === normalized && item.status !== "CANCELLED" && within(item.startAt, item.endAt));
  if (invitation) return { plateNumber: normalized, vehicle, invitation, status: "TEMPORARY", decision: "AUTHORIZED", reason: "Invitation is valid" };
  return { plateNumber: normalized, vehicle, invitation: null, status: vehicle ? "EXPIRED" : "UNREGISTERED", decision: "UNAUTHORIZED", reason: vehicle ? "No valid permission at this time" : "Vehicle is not registered" };
}

// ============================================================
// SETTINGS
// ============================================================
export const saveSetting = (changes) => write("settings", [{ ...read("settings")[0], ...changes }]);
export const getSettings = () => read("settings")[0] || {};

// ============================================================
// HISTORY / STATS - localStorage fallback
// ============================================================
export const getVehicleVisits = (plate) => read("visits").filter((visit) => visit.plateNumber === plate);
export const getVehicleDetections = (plate) => read("detections").filter((detection) => detection.plateNumber === plate);
export const getVehiclePermissions = (plate) => read("permissions").filter((permission) => permission.plateNumber === plate);
export const getCustomerHistory = (account, plate = account?.plateNumber) => getCustomerHistorySync(account, plate);
export function getCustomerHistorySync(account, plate = account?.plateNumber) {
  const ownedPlates = read("vehicles").filter((v) => (account?.id && v.customer_id === account.id) || v.plateNumber === plate).map((v) => v.plateNumber);
  const visitsHistory = read("visits").filter((item) => { const match = item.plateNumber === plate; return ownedPlates.includes(item.plateNumber) && (!plate || match); }).map((item) => ({ ...item, entryTime: item.entryTime || item.timestamp, historyType: "Visit" }));
  const detectionsHistory = read("detections").map((item) => ({ ...item, entryTime: item.timestamp || item.detected_at, historyType: "Detection" })).filter((item) => { const match = item.plateNumber === plate; return ownedPlates.includes(item.plateNumber) && (!plate || match); });
  return [...visitsHistory, ...detectionsHistory].sort((left, right) => new Date(right.entryTime || right.timestamp) - new Date(left.entryTime || left.timestamp)).slice(0, 30);
}
export const getVehicleStats = (plate) => { const history = getCustomerHistorySync({ plateNumber: plate }, plate); const visits = read("visits").filter((item) => item.plateNumber === plate); const durations = visits.map((item) => Number(item.durationMinutes || 0)).filter(Boolean); return { detections: history.filter((item) => item.historyType === "Detection").length, visits: visits.length, averageStay: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0 }; };

// ============================================================
// PASSWORD RESET - API-first
// ============================================================
export async function requestPasswordReset(payload) {
  if (getAccessToken()) {
    try {
      const data = await apiFetch("/api/password-reset/request", { method: "POST", body: JSON.stringify({ plateNumber: normalizePlate(payload.plateNumber), ownerName: payload.ownerName }) });
      write("passwordResetRequests", [data, ...read("passwordResetRequests")]);
      return data;
    } catch (error) {
      console.error("Failed to request password reset via API:", error);
      throw error;
    }
  }
  throw new Error("Authentication required for password reset");
}

export async function resetAdminPassword(payload) {
  const data = await apiFetch("/api/auth/admin-password-reset", { method: "POST", body: JSON.stringify({ adminId: payload.adminId, displayName: payload.displayName, newPassword: payload.newPassword }) });
  return data;
}

export async function getPasswordResetRequests() {
  if (getAccessToken()) {
    try {
      const data = await apiFetch("/api/password-reset/requests");
      write("passwordResetRequests", data);
      return data;
    } catch (error) {
      console.error("Failed to fetch password reset requests:", error);
    }
  }
  return read("passwordResetRequests");
}

export async function resolvePasswordReset(id, action) {
  if (getAccessToken()) {
    try {
      const data = await apiFetch(`/api/password-reset/${id}/resolve`, { method: "POST", body: JSON.stringify({ action }) });
      write("passwordResetRequests", read("passwordResetRequests").map((item) => item.id === id ? { ...item, ...data } : item));
      return data;
    } catch (error) {
      console.error("Failed to resolve password reset:", error);
      throw error;
    }
  }
  throw new Error("Authentication required to resolve password reset");
}

// ============================================================
// COMPLAINTS - API-first
// ============================================================
export async function createComplaint(payload) {
  if (getAccessToken()) {
    try {
      const data = await apiFetch("/api/complaints", { method: "POST", body: JSON.stringify(payload) });
      write("complaints", [data, ...read("complaints")]);
      return data;
    } catch (error) {
      console.error("Failed to create complaint via API:", error);
      throw error;
    }
  }
  throw new Error("Authentication required to create complaint");
}

export async function getComplaints() {
  if (getAccessToken()) {
    try {
      const data = await apiFetch("/api/complaints");
      write("complaints", data);
      return data;
    } catch (error) {
      console.error("Failed to fetch complaints:", error);
    }
  }
  return read("complaints");
}

export async function updateComplaintStatus(id, status, adminResponse = "") {
  if (getAccessToken()) {
    try {
      const payload = { status };
      if (adminResponse !== undefined && adminResponse !== null) payload.adminResponse = String(adminResponse).trim();
      const data = await apiFetch(`/api/complaints/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
      write("complaints", read("complaints").map((item) => item.id === id ? { ...item, ...data } : item));
      return data;
    } catch (error) {
      console.error("Failed to update complaint status:", error);
      throw error;
    }
  }
  throw new Error("Authentication required to update complaint");
}

// ============================================================
// SYNC - Full backend sync
// ============================================================
export async function syncBackendData() {
  if (!getAccessToken()) throw new Error("Not authenticated");
  const results = {};
  const safeFetch = async (key, path) => { try { results[key] = await apiFetch(path); } catch { results[key] = []; } };
  const requests = [
    safeFetch("vehicles", "/api/vehicles"),
    safeFetch("detections", "/api/events?limit=1000"),
    safeFetch("visits", "/api/visits?limit=1000"),
    safeFetch("invitations", "/api/invitations"),
    safeFetch("alerts", "/api/alerts?limit=1000"),
    safeFetch("permissions", "/api/permissions"),
    safeFetch("complaints", "/api/complaints"),
  ];
  if (getSession()?.user?.role === "ADMIN") requests.push(safeFetch("passwordResetRequests", "/api/password-reset/requests"));
  await Promise.all(requests);
  const merge = (key, records) => {
    const existing = read(key);
    const byId = new Map(existing.map((item) => [item.id, item]));
    (records || []).forEach((item) => {
      if (!item.id) return;
      const normalized = { ...item, plateNumber: item.plateNumber || item.plate_number };
      byId.set(normalized.id, { ...byId.get(normalized.id), ...normalized, source: normalized.source || "REAL", demoData: false });
    });
    const serverIds = new Set((records || []).map((item) => item.id).filter(Boolean));
    const demoRecords = existing.filter((item) => (item.demoData || item.source === "DEMO") && !serverIds.has(item.id));
    write(key, [...demoRecords, ...(records || []).map((item) => byId.get(item.id) || item)].sort((left, right) => new Date(right.timestamp || right.entryTime || right.startAt || right.createdAt || 0) - new Date(left.timestamp || left.entryTime || left.startAt || left.createdAt || 0)));
  };
  for (const key of Object.keys(results)) merge(key, results[key]);
  return results;
}

export { demoVehicles, keys, purposes, types };

