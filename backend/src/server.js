import cors from "cors";
import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { addEvent, dashboardStats, recentEvents } from "./store.js";
import { createAuthClient, supabase, supabaseConfigured } from "./supabase.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const server = app.listen(port, () => console.log(`Vehicle security API listening on ${port}`));
const sockets = new Set();
const websocketServer = new WebSocketServer({ noServer: true });
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const SERVICE_TOKEN = process.env.SERVICE_TOKEN || "";
const AI_HEALTH_URL = process.env.LPRS_AI_URL || "http://localhost:5001";
const EVIDENCE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../output/evidence");
const EVENT_DEDUPLICATION_WINDOW_MS = Number(process.env.EVENT_DEDUPLICATION_WINDOW_MS || 30000);
const recentEventKeys = new Map();

const normalizePlate = (value) => String(value || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
const isAdmin = (request) => { const role = request.client?.role; return role === "ADMIN" || role === "SERVICE"; };
const toAuthEmail = (username) => {
  const value = String(username || "").trim().toLowerCase();
  if (value === "admin") return "admin@nexplate.internal";
  if (/^[^@\s]+@[^@\s]+$/.test(value)) return value;
  return `${normalizePlate(value)}@nexplate.internal`;
};
const broadcast = (message) => { const encoded = JSON.stringify(message); for (const socket of sockets) if (socket.readyState === 1) socket.send(encoded); };
const fail = (response, status, error) => response.status(status).json({ error: String(error) });

async function getDatabaseHealth() {
  if (!supabaseConfigured) return { status: "IN_MEMORY", connected: false };
  try {
    const { error } = await supabase.from("vehicles").select("id", { head: true }).limit(1);
    if (error) return { status: "ERROR", connected: false, error: error.message };
    return { status: "CONNECTED", connected: true };
  } catch (error) {
    return { status: "ERROR", connected: false, error: error.message };
  }
}

async function getAiHealth() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch(`${AI_HEALTH_URL}/health`, { signal: controller.signal });
    return { status: response.ok ? "ONLINE" : "ERROR", connected: response.ok };
  } catch (error) {
    return { status: "OFFLINE", connected: false, error: error.name === "AbortError" ? "Health check timed out" : error.message };
  } finally {
    clearTimeout(timeout);
  }
}

const publicEvent = (row) => ({
  ...row,
  id: row.id,
  plateNumber: row.plate_number,
  vehicleType: row.vehicle_type,
  ocrConfidence: row.ocr_confidence,
  yoloConfidence: row.yolo_confidence,
  timestamp: row.detected_at,
  cameraId: row.camera_id,
  evidencePath: row.evidence_path,
  evidenceUrl: row.evidence_url,
  ownerId: row.owner_id,
  ownerName: row.owner_name,
});

const eventKey = (payload) => [
  normalizePlate(payload.plateNumber || payload.plate || payload.raw_ocr || payload.rawOcr),
  String(payload.status || "UNKNOWN").toUpperCase(),
].join(":");

const isDuplicateEvent = (payload, now = Date.now()) => {
  const key = eventKey(payload);
  if (key === ":UNKNOWN") return false;
  const previous = recentEventKeys.get(key);
  for (const [storedKey, timestamp] of recentEventKeys) {
    if (now - timestamp > EVENT_DEDUPLICATION_WINDOW_MS) recentEventKeys.delete(storedKey);
  }
  return previous !== undefined && now - previous < EVENT_DEDUPLICATION_WINDOW_MS;
};
const rememberEvent = (payload, now = Date.now()) => {
  const key = eventKey(payload);
  if (key !== ":UNKNOWN") recentEventKeys.set(key, now);
};

async function writeAudit(action, entityType, entityId, request, metadata = {}) {
  if (!supabaseConfigured) return;
  await supabase.from("audit_logs").insert({
    actor_id: request?.client?.id === "service" ? null : request?.client?.id || null,
    actor_role: request?.client?.role || "SYSTEM",
    action,
    entity_type: entityType,
    entity_id: entityId ? String(entityId) : null,
    metadata,
  });
}

async function loadProfile(userId) {
  if (!supabase) return null;
  const { data } = await supabase.from("profiles").select("role, display_name, plate_number").eq("id", userId).maybeSingle();
  return data || null;
}

async function authenticate(request, response, next) {
  if (!supabaseConfigured) return next();
  const header = request.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return fail(response, 401, "Authentication required. Send Authorization: Bearer <token>");
  if (SERVICE_TOKEN && token === SERVICE_TOKEN) { request.client = { id: "service", role: "SERVICE", service: true }; return next(); }
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return fail(response, 401, "Invalid or expired token");
    const profile = await loadProfile(data.user.id);
    request.client = { ...data.user, role: profile?.role || "CUSTOMER", profile };
    next();
  } catch {
    return fail(response, 401, "Invalid or expired token");
  }
}

const requireRole = (...roles) => (request, response, next) => {
  const role = request.client?.role;
  if (!role || (role !== "SERVICE" && !roles.includes(role))) return fail(response, 403, "Insufficient permissions");
  next();
};

async function ownedVehicleIds(request, plate = "") {
  if (isAdmin(request)) return null;
  let query = supabase.from("vehicles").select("id").eq("customer_id", request.client.id);
  if (plate) query = query.eq("normalized_plate", normalizePlate(plate));
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((vehicle) => vehicle.id);
}

// ============================================================
// ACCESS DECISION ENGINE
// ============================================================
async function evaluateAccess(plateNumber, at = new Date(), ocrContext = {}) {
  const plate = normalizePlate(plateNumber);
  const timestamp = new Date(at).toISOString();

  // OCR quality gates first: never classify OCR failure as unauthorized
  const statusHint = ocrContext.status || ocrContext.state;
  if (["OCR_FAILED"].includes(statusHint) && !plate) {
    return { vehicle: null, invitation: null, permission: null, status: "OCR_FAILED", decision: "UNKNOWN", reason: "OCR returned no readable plate" };
  }
  if (["OCR_UNCERTAIN", "INVALID_PLATE"].includes(statusHint) && !plate) {
    return { vehicle: null, invitation: null, permission: null, status: statusHint, decision: "UNKNOWN", reason: "OCR confidence below threshold; continue reading frames" };
  }
  if (!plate) {
    return { vehicle: null, invitation: null, permission: null, status: "OCR_FAILED", decision: "UNKNOWN", reason: "No plate supplied" };
  }

  let { data: vehicle, error: vehicleError } = await supabase.from("vehicles").select("*").eq("normalized_plate", plate).maybeSingle();
  if (vehicleError) throw vehicleError;
  if (!vehicle) {
    const fallback = await supabase.from("vehicles").select("*").eq("plate_number", plate).maybeSingle();
    if (fallback.error) throw fallback.error;
    vehicle = fallback.data || null;
  }
  if (vehicle?.status === "BLOCKED" || vehicle?.registration_status === "BLOCKED") {
    return { vehicle, invitation: null, permission: null, status: "BLOCKED", decision: "UNAUTHORIZED", reason: "Vehicle is blocked" };
  }

  // 1) Registered vehicle with an ACTIVE permission inside its time window
  if (vehicle) {
    const { data: permission, error: permissionError } = await supabase.from("permissions")
      .select("*")
      .eq("normalized_plate", plate)
      .in("status", ["ACTIVE", "PERMANENT"])
      .or(`valid_from.is.null,valid_from.lte.${timestamp}`)
      .or(`valid_until.is.null,valid_until.gte.${timestamp}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (permissionError) throw permissionError;

    const permissionValid = permission && (!permission.valid_from || timestamp >= permission.valid_from) && (!permission.valid_until || timestamp <= permission.valid_until);
    if (permissionValid && permission.status === "BLOCKED") {
      return { vehicle, invitation: null, permission, status: "PERMISSION_BLOCKED", decision: "UNAUTHORIZED", reason: "Permission is blocked" };
    }
    if (permissionValid) {
      return { vehicle, invitation: null, permission, status: "PERMISSION_VALID", decision: "AUTHORIZED", reason: "Registered vehicle with an active permission within its valid time window" };
    }
    if (permission && permission.valid_until && timestamp > permission.valid_until) {
      return { vehicle, invitation: null, permission, status: "PERMISSION_EXPIRED", decision: "UNAUTHORIZED", reason: `Permission expired at ${permission.valid_until}` };
    }

    // 2) Legacy vehicle-level window support
    if ((!vehicle.valid_from || timestamp >= vehicle.valid_from) && (!vehicle.valid_until || timestamp <= vehicle.valid_until)) {
      return { vehicle, invitation: null, permission: null, status: "REGISTERED", decision: "AUTHORIZED", reason: "Registered vehicle permission is valid" };
    }
    if (vehicle.valid_until && timestamp > vehicle.valid_until) {
      return { vehicle, invitation: null, permission: null, status: "PERMISSION_EXPIRED", decision: "UNAUTHORIZED", reason: "Registered vehicle permission has expired" };
    }
  }

  // 3) Invitation for registered or unregistered vehicle
  const { data: invitation, error: invitationError } = await supabase.from("invitations")
    .select("*")
    .eq("normalized_plate", plate)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (invitationError) throw invitationError;

  if (invitation) {
    if (invitation.status === "BLOCKED") return { vehicle, invitation, permission: null, status: "INVITATION_BLOCKED", decision: "UNAUTHORIZED", reason: "Invitation is blocked" };
    if (invitation.status === "CANCELLED") return { vehicle, invitation, permission: null, status: "INVITATION_BLOCKED", decision: "UNAUTHORIZED", reason: "Invitation is cancelled" };
    const inWindow = timestamp >= invitation.start_at && timestamp <= invitation.end_at;
    if (!inWindow) return { vehicle, invitation, permission: null, status: timestamp > invitation.end_at ? "INVITATION_EXPIRED" : "INVITATION_EXPIRED", decision: "UNAUTHORIZED", reason: `Invitation is outside its active window (start ${invitation.start_at}, end ${invitation.end_at})` };
    return { vehicle, invitation, permission: null, status: "INVITATION_ACTIVE", decision: "AUTHORIZED", reason: "Invitation is active and inside its time window" };
  }

  // 4) Unknown vehicle with no registration and no invitation
  return { vehicle, invitation: null, permission: null, status: vehicle ? "PERMISSION_EXPIRED" : "UNREGISTERED", decision: "UNAUTHORIZED", reason: vehicle ? "No valid permission at this time" : "Vehicle is not registered and has no active invitation" };
}

// ============================================================
// PERSIST DETECTION + VISIT + ALERT
// ============================================================
async function persistEvent(payload) {
  const plateNumber = normalizePlate(payload.plateNumber || payload.plate);
  const timestamp = payload.timestamp || new Date().toISOString();
  const idempotencyKey = String(payload.idempotencyKey || payload.idempotency_key || `${payload.cameraId || "laptop-browser-1"}:${timestamp}:${plateNumber || "NO_PLATE"}`);

  const { data: existing, error: existingError } = await supabase.from("detections").select("*").eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existingError) throw existingError;
  if (existing) return publicEvent(existing);

  const access = await evaluateAccess(plateNumber, timestamp, payload);
  const ocrConfidence = Number(payload.ocr_confidence ?? payload.ocrConfidence ?? 0);
  const explicitOcrFailure = ["OCR_FAILED", "OCR_UNCERTAIN", "INVALID_PLATE"].includes(payload.status) ? payload.status : null;
  const readAuthorizedPlate = access.vehicle && ["PERMISSION_VALID", "REGISTERED", "INVITATION_ACTIVE", "AUTHORIZED", "TEMPORARY"].includes(access.status) && access.vehicle.plate_number === plateNumber;
  const status = explicitOcrFailure || ((plateNumber ? (ocrConfidence <= 0 && !readAuthorizedPlate) : true) ? (access.status || "OCR_FAILED") : access.status);
  const decision = ["PERMISSION_VALID", "REGISTERED", "INVITATION_ACTIVE", "AUTHORIZED", "TEMPORARY"].includes(access.status) ? "AUTHORIZED" : ["UNAUTHORIZED", "BLOCKED", "EXPIRED", "UNREGISTERED", "PERMISSION_BLOCKED", "PERMISSION_EXPIRED", "INVITATION_BLOCKED", "INVITATION_EXPIRED"].includes(access.status) ? "UNAUTHORIZED" : "UNKNOWN";

  const event = {
    idempotency_key: idempotencyKey,
    plate_number: plateNumber,
    normalized_plate: plateNumber,
    vehicle_id: access.vehicle?.id || null,
    vehicle_type: access.vehicle?.vehicle_type || access.invitation?.vehicle_type || payload.vehicleType || payload.vehicle_type || "Unknown",
    raw_ocr: payload.raw_ocr || payload.rawOcr || null,
    ocr_confidence: ocrConfidence,
    yolo_confidence: Number(payload.yolo_confidence ?? payload.yoloConfidence ?? 0),
    status,
    decision,
    purpose: payload.purpose || access.invitation?.purpose || access.vehicle?.purpose || null,
    invitation_id: access.invitation?.id || null,
    camera_id: payload.cameraId || payload.camera_id || "laptop-browser-1",
    evidence_path: payload.evidencePath || payload.evidence_path || null,
    evidence_url: payload.evidenceUrl || payload.evidence_url || null,
    source: payload.source || "REAL",
    detected_at: timestamp,
  };

  const { data: inserted, error } = await supabase.from("detections").insert(event).select("*").single();
  if (error) throw error;

  const publicResult = {
    ...publicEvent(inserted),
    decision,
    ownerName: access.vehicle?.owner_name || access.invitation?.person || "N/A",
    purpose: inserted.purpose,
    source: inserted.source,
    decisionStatus: access.status,
    decisionReason: access.reason || null,
    ocr_consensus: Number(payload.ocr_consensus || 0),
    format_valid: payload.format_valid === true,
  };

  // Update or create visit
  const { data: activeVisit, error: activeVisitError } = await supabase.from("visits").select("id").eq("normalized_plate", plateNumber).is("exit_time", null).maybeSingle();
  if (activeVisitError) {
    await supabase.from("detections").delete().eq("id", inserted.id);
    throw activeVisitError;
  }
  let visitError = null;
  if (activeVisit?.id) {
    ({ error: visitError } = await supabase.from("visits").update({ last_seen_at: timestamp, status, authorization_status: decision, detection_id: inserted.id }).eq("id", activeVisit.id));
  } else if (plateNumber) {
    ({ error: visitError } = await supabase.from("visits").insert({
      plate_number: plateNumber,
      normalized_plate: plateNumber,
      vehicle_id: access.vehicle?.id || null,
      detection_id: inserted.id,
      entry_time: timestamp,
      last_seen_at: timestamp,
      status,
      authorization_status: decision,
      purpose: inserted.purpose,
      source: inserted.source,
    }));
  }
  if (visitError) {
    await supabase.from("detections").delete().eq("id", inserted.id);
    throw visitError;
  }

  // Update or create vehicle session
  const sessionPlate = access.vehicle?.id ? access.vehicle.id : `${plateNumber}:visitor`;
  if (access.vehicle?.id || plateNumber) {
    const { data: activeSession } = await supabase.from("vehicle_sessions").select("id, detection_count").eq("status", "ACTIVE").eq("normalized_plate", plateNumber).maybeSingle();
    if (activeSession?.id) {
      await supabase.from("vehicle_sessions").update({ last_seen_at: timestamp, detection_count: (activeSession.detection_count || 0) + 1, best_ocr: plateNumber, best_ocr_confidence: ocrConfidence, authorization_status: decision }).eq("id", activeSession.id);
    } else {
      await supabase.from("vehicle_sessions").insert({
        vehicle_id: access.vehicle?.id || null,
        plate_number: plateNumber,
        normalized_plate: plateNumber,
        session_start: timestamp,
        entry_time: timestamp,
        last_seen_at: timestamp,
        detection_count: 1,
        best_ocr: plateNumber,
        best_ocr_confidence: ocrConfidence,
        authorization_status: decision,
        status: "ACTIVE",
      });
    }
  }
  void sessionPlate;

  // Create alert for suspicious events
  if (["UNAUTHORIZED", "BLOCKED", "EXPIRED", "UNREGISTERED", "PERMISSION_BLOCKED", "PERMISSION_EXPIRED", "INVITATION_BLOCKED", "INVITATION_EXPIRED", "OCR_FAILED", "OCR_UNCERTAIN", "INVALID_PLATE"].includes(status)) {
    const { data: activeAlert, error: activeAlertError } = await supabase.from("alerts")
      .select("id")
      .eq("plate_number", plateNumber)
      .eq("type", status)
      .eq("is_read", false)
      .gte("created_at", new Date(Date.now() - EVENT_DEDUPLICATION_WINDOW_MS).toISOString())
      .maybeSingle();
    if (activeAlertError) console.error("Failed to check for a recent alert:", activeAlertError.message);
    if (!activeAlert?.id) {
      const { error: alertInsertError } = await supabase.from("alerts").insert({
        plate_number: plateNumber,
        detection_id: inserted.id,
        type: status,
        severity: decision === "UNAUTHORIZED" ? "HIGH" : (["OCR_FAILED", "OCR_UNCERTAIN"].includes(status) ? "MEDIUM" : "MEDIUM"),
        message: `${status} detected`,
        created_at: timestamp,
      });
      if (alertInsertError) console.error("Failed to persist detection alert:", alertInsertError.message);
    }
  }

  return publicResult;
}

// ============================================================
// ROUTES: Health
// ============================================================
app.get("/", (_request, response) => response.json({
  service: "vehicle-security-backend",
  message: "Backend API is running. Use the health endpoint to inspect database and AI connectivity.",
  health: "/health",
  status: "/api/system/status",
}));

app.get("/health", async (_request, response) => {
  const [database, ai] = await Promise.all([getDatabaseHealth(), getAiHealth()]);
  const status = database.status === "ERROR" ? "degraded" : "ok";
  response.status(status === "ok" ? 200 : 503).json({ status, service: "backend", database, ai });
});

app.get("/api/system/status", async (_request, response) => {
  const [database, ai] = await Promise.all([getDatabaseHealth(), getAiHealth()]);
  response.json({ api: "ONLINE", database, ai, mode: process.env.DEMO_MODE === "true" ? "DEMO" : "LIVE" });
});

// ============================================================
// ROUTES: Auth
// ============================================================
app.post("/api/auth/login", async (request, response) => {
  if (!supabaseConfigured) return fail(response, 503, "Supabase is not configured on this backend");
  const { username, password, role: requestedRole } = request.body || {};
  if (!username || !password) return fail(response, 400, "username and password are required");
  try {
    const authClient = createAuthClient();
    const candidateEmails = new Set([toAuthEmail(username)]);
    const plate = normalizePlate(username);

    if (plate) {
      const { data: linkedVehicles } = await supabase.from("vehicles").select("customer_id, owner_email").eq("normalized_plate", plate).limit(10);
      for (const vehicle of linkedVehicles || []) {
        if (vehicle.owner_email) candidateEmails.add(String(vehicle.owner_email).trim().toLowerCase());
        if (vehicle.customer_id) {
          const { data: customer } = await supabase.from("customers").select("email").eq("id", vehicle.customer_id).maybeSingle();
          if (customer?.email) candidateEmails.add(String(customer.email).trim().toLowerCase());
        }
      }
    }

    let authResult = null;
    let lastError = null;

    for (const email of candidateEmails) {
      const { data, error } = await authClient.auth.signInWithPassword({ email, password });
      if (error) {
        lastError = error;
        continue;
      }
      authResult = data;
      break;
    }

    if (!authResult) {
      if (lastError?.message === "fetch failed") {
        return fail(response, 503, "Supabase authentication service is unreachable. Check SUPABASE_URL and network connectivity.");
      }
      return fail(response, 401, lastError?.message || "Invalid plate number or password");
    }

    const profile = await loadProfile(authResult.user.id);
    const role = profile?.role || authResult.user.user_metadata?.role || "CUSTOMER";
    if (requestedRole && role !== requestedRole) return fail(response, 403, "Account does not match the selected role");
    response.json({
      access_token: authResult.session.access_token,
      refresh_token: authResult.session.refresh_token,
      user: {
        id: authResult.user.id,
        email: authResult.user.email,
        role,
        display_name: profile?.display_name || authResult.user.user_metadata?.display_name || authResult.user.email,
        plate_number: profile?.plate_number || authResult.user.user_metadata?.plate_number || null,
      },
    });
  } catch (error) {
    const message = error?.message === "fetch failed"
      ? "Supabase authentication service is unreachable. Check SUPABASE_URL and network connectivity."
      : error.message;
    return fail(response, 503, message || "Authentication service unavailable");
  }
});

app.post("/api/auth/admin-password-reset", async (request, response) => {
  const { adminId, displayName } = request.body || {};
  if (!adminId || !displayName) return fail(response, 400, "Admin ID/email and registered name are required");
  if (!supabaseConfigured) return fail(response, 503, "Supabase is not configured on this backend");
  try {
    const identity = String(adminId).trim().toLowerCase();
    const registeredName = String(displayName).trim().toLowerCase();
    const { data: profiles, error: profileError } = await supabase.from("profiles").select("id, display_name").eq("role", "ADMIN").ilike("display_name", displayName).limit(10);
    if (profileError) throw profileError;
    const authClient = createAuthClient();
    const profile = (profiles || []).find((item) => String(item.display_name || "").trim().toLowerCase() === registeredName);
    if (profile) {
      const { data: account, error: accountError } = await authClient.auth.admin.getUserById(profile.id);
      if (accountError) throw accountError;
      const accountEmail = String(account?.user?.email || "").trim().toLowerCase();
      const suppliedEmail = toAuthEmail(identity);
      if (accountEmail && (identity === profile.id || identity === accountEmail || suppliedEmail === accountEmail)) {
        const options = process.env.PASSWORD_RESET_REDIRECT_URL ? { redirectTo: process.env.PASSWORD_RESET_REDIRECT_URL } : undefined;
        const { error } = await authClient.auth.resetPasswordForEmail(accountEmail, options);
        if (error) throw error;
      }
    }
    // Do not disclose whether an administrator account matched the supplied details.
    response.status(202).json({ status: "REQUESTED", message: "If the account details match, a password-reset link has been sent to the registered email address." });
  } catch (error) {
    fail(response, 503, "Password-reset request could not be processed");
  }
});

app.post("/api/auth/refresh", async (request, response) => {
  if (!supabaseConfigured) return fail(response, 503, "Supabase is not configured on this backend");
  const { refresh_token } = request.body || {};
  if (!refresh_token) return fail(response, 400, "refresh_token is required");
  try {
    const authClient = createAuthClient();
    const { data, error } = await authClient.auth.refreshSession({ refresh_token });
    if (error) return fail(response, 401, "Invalid refresh token");
    response.json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  } catch (error) {
    return fail(response, 500, error.message);
  }
});

// ============================================================
// MIDDLEWARE: require auth for all /api routes except auth
// ============================================================
app.use("/api", (request, response, next) => { if (request.path.startsWith("/auth/") || request.path === "/password-reset/request") return next(); authenticate(request, response, next); });

// ============================================================
// ROUTES: Evidence
// ============================================================
app.get("/api/evidence/:name", (request, response) => {
  const name = path.basename(request.params.name);
  const filePath = path.join(EVIDENCE_DIR, name);
  if (!fs.existsSync(filePath)) return fail(response, 404, "Evidence frame not found");
  response.sendFile(filePath);
});

app.get("/api/evidence", async (request, response) => {
  try {
    if (!supabaseConfigured) return response.json([]);
    const { detection_id } = request.query;
    let builder = supabase.from("evidence").select("*").order("created_at", { ascending: false }).limit(500);
    if (detection_id) builder = builder.eq("detection_id", detection_id);
    const { data, error } = await builder;
    if (error) throw error;
    response.json(data);
  } catch (error) {
    fail(response, 503, error.message);
  }
});

app.post("/api/evidence", async (request, response) => {
  const { detection_id, file_path, file_url, file_size, mime_type, metadata } = request.body || {};
  if (!detection_id || !file_path) return fail(response, 400, "detection_id and file_path are required");
  try {
    if (!supabaseConfigured) return fail(response, 503, "Supabase is not configured");
    const { data, error } = await supabase.from("evidence").insert({ detection_id, file_path, file_url: file_url || null, file_size: file_size || null, mime_type: mime_type || null, metadata: metadata || {} }).select().single();
    if (error) throw error;
    response.status(201).json(data);
  } catch (error) {
    fail(response, 503, error.message);
  }
});

// ============================================================
// ROUTES: Customers
// ============================================================
app.get("/api/customers", requireRole("ADMIN"), async (request, response) => {
  try {
    if (!supabaseConfigured) return response.json([]);
    const { page = 1, limit = 50, search } = request.query;
    const from = (Number(page) - 1) * Number(limit);
    const to = from + Number(limit) - 1;
    let builder = supabase.from("customers").select("*").order("created_at", { ascending: false });
    if (search) builder = builder.or(`display_name.ilike.%${search}%,email.ilike.%${search}%,customer_code.ilike.%${search}%`);
    const { data, error } = await builder.range(from, to);
    if (error) throw error;
    response.json(data);
  } catch (error) {
    fail(response, 503, error.message);
  }
});

app.get("/api/customers/:id", async (request, response) => {
  try {
    if (!supabaseConfigured) return fail(response, 503, "Supabase is not configured");
    if (!isAdmin(request) && request.params.id !== request.client.id) return fail(response, 403, "Insufficient permissions");
    const { data, error } = await supabase.from("customers").select("*").eq("id", request.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return fail(response, 404, "Customer not found");
    response.json(data);
  } catch (error) {
    fail(response, 503, error.message);
  }
});

// ============================================================
// ROUTES: Vehicle Sessions
// ============================================================
app.get("/api/vehicle-sessions", async (request, response) => {
  try {
    if (!supabaseConfigured) return response.json([]);
    const { plate_number, status = "ACTIVE", limit = 100 } = request.query;
    let builder = supabase.from("vehicle_sessions").select("*, vehicles(*)").order("last_seen_at", { ascending: false }).limit(Math.min(Number(limit) || 100, 500));
    const ownedIds = await ownedVehicleIds(request, plate_number);
    if (ownedIds && !ownedIds.length) return response.json([]);
    if (ownedIds) builder = builder.in("vehicle_id", ownedIds);
    if (plate_number) builder = builder.eq("normalized_plate", normalizePlate(plate_number));
    if (status !== "ALL") builder = builder.eq("status", status);
    const { data, error } = await builder;
    if (error) throw error;
    response.json(data);
  } catch (error) {
    fail(response, 503, error.message);
  }
});

// ============================================================
// ROUTES: Vehicles
// ============================================================
app.get("/api/vehicles", async (request, response) => {
  try {
    if (!supabaseConfigured) return response.json([]);
    let builder = supabase.from("vehicles").select("*").order("created_at", { ascending: false });
    if (!isAdmin(request)) builder = builder.eq("customer_id", request.client.id);
    const search = request.query.search;
    if (search && isAdmin(request)) {
      const term = String(search).trim();
      const termLoose = `%${term}%`;
      builder = builder.or(`plate_number.ilike.${termLoose},owner_name.ilike.${termLoose},owner_phone.ilike.${termLoose},owner_email.ilike.${termLoose},driver_name.ilike.${termLoose},driver_phone.ilike.${termLoose},customer_code.ilike.${termLoose},vehicle_type.ilike.${termLoose},purpose.ilike.${termLoose},house_no.ilike.${termLoose},make.ilike.${termLoose},model.ilike.${termLoose}`);
    }
    if (request.query.customer_id) builder = builder.eq("customer_id", request.query.customer_id);
    const limit = Math.min(Number(request.query.limit) || 1000, 2000);
    const { data, error } = await builder.limit(limit);
    if (error) throw error;
    response.json(data.map((vehicle) => ({
      ...vehicle,
      plateNumber: vehicle.plate_number,
      vehicleType: vehicle.vehicle_type,
      ownerName: vehicle.owner_name,
      houseNo: vehicle.house_no,
      customerCode: vehicle.customer_code,
    })));
  } catch (error) {
    fail(response, 503, error.message);
  }
});

app.get("/api/vehicles/:plate", async (request, response) => {
  const plate = normalizePlate(request.params.plate);
  try {
    let builder = supabase.from("vehicles").select("*").eq("normalized_plate", plate);
    if (!isAdmin(request)) builder = builder.eq("customer_id", request.client.id);
    const { data, error } = await builder.maybeSingle();
    if (error) throw error;
    if (!data) {
      if (isAdmin(request)) return response.status(404).json({ plateNumber: plate, category: "NEW VEHICLE", status: "UNREGISTERED" });
      return fail(response, 404, "Vehicle not found");
    }
    response.json({ ...data, plateNumber: data.plate_number, vehicleType: data.vehicle_type, ownerName: data.owner_name, houseNo: data.house_no, customerCode: data.customer_code });
  } catch (error) {
    fail(response, 503, error.message);
  }
});

app.post("/api/vehicles", requireRole("ADMIN"), async (request, response) => {
  const body = request.body || {};
  const plate = normalizePlate(body.plateNumber || body.plate_number);
  const vehicle = {
    plate_number: plate,
    normalized_plate: plate,
    vehicle_type: body.vehicleType || body.vehicle_type || "Car",
    make: body.make || null,
    model: body.model || null,
    color: body.color || null,
    owner_name: body.ownerName || body.owner_name || "Unknown",
    owner_phone: body.ownerPhone || body.owner_phone || null,
    owner_email: body.ownerEmail || body.owner_email || null,
    driver_name: body.driverName || body.driver_name || null,
    driver_phone: body.driverPhone || body.driver_phone || null,
    purpose: body.purpose || "Employee",
    access_type: body.accessType || body.access_type || "Permanent",
    status: "AUTHORIZED",
    valid_from: body.validFrom || body.valid_from || null,
    valid_until: body.validUntil || body.valid_until || null,
    house_no: body.houseNo || body.house_no || null,
    customer_code: body.customerCode || body.customer_code || null,
  };
  if (!vehicle.plate_number || vehicle.plate_number.length < 6) return fail(response, 400, "A valid plate number is required");
  try {
    // Verify customer_code uniqueness and generate if missing
    if (vehicle.customer_code) {
      const { data: existingCode } = await supabase.from("customers").select("id").eq("customer_code", vehicle.customer_code).maybeSingle();
      if (!existingCode) vehicle.customer_code = null;
    } else {
      vehicle.customer_code = null;
    }

    let customerId = body.customerId || body.customer_id || null;
    let customerCode = vehicle.customer_code || null;

    // Create authenticated customer account when password is supplied (new customer flow)
    if (body.password && !customerId) {
      const email = body.ownerEmail || toAuthEmail(vehicle.plate_number);
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
        user_metadata: { role: "CUSTOMER", display_name: vehicle.owner_name, plate_number: vehicle.plate_number },
      });
      if (createError && !/already|exists/i.test(createError.message)) return fail(response, 400, createError.message);
      customerId = created?.user?.id || (await supabase.from("customers").select("id").eq("email", email).maybeSingle())?.data?.id || customerId;
    }

    // Auto-generate a stable customer code when one is missing
    if (!customerCode) {
      const { data: count } = await supabase.from("customers").select("id", { count: "exact", head: true });
      const next = (count || 0) + 1;
      customerCode = `CUST-${String(next).padStart(5, "0")}`;
    }

    // Ensure a customers row exists
    if (customerId) {
      const { data: existingProfile } = await supabase.from("customers").select("id").eq("id", customerId).maybeSingle();
      if (!existingProfile) {
        await supabase.from("customers").insert({
          id: customerId,
          customer_code: customerCode,
          display_name: vehicle.owner_name,
          email: vehicle.owner_email,
          phone: vehicle.owner_phone,
          house_no: vehicle.house_no,
        });
      } else {
        await supabase.from("customers").update({ customer_code: customerCode, display_name: vehicle.owner_name, email: vehicle.owner_email, phone: vehicle.owner_phone, house_no: vehicle.house_no, updated_at: new Date().toISOString() }).eq("id", customerId);
      }
    }

    const { data, error } = await supabase.from("vehicles").insert({ ...vehicle, customer_id: customerId, customer_code: customerCode }).select().single();
    if (error) throw error;

    // Link an initial permission when a window was provided
    if (vehicle.valid_from || vehicle.valid_until) {
      const { error: permissionError } = await supabase.from("permissions").insert({
        plate_number: plate,
        normalized_plate: plate,
        vehicle_id: data.id,
        person: vehicle.owner_name,
        purpose: vehicle.purpose || "Employee",
        valid_from: vehicle.valid_from || null,
        valid_until: vehicle.valid_until || null,
        status: "ACTIVE",
        created_by: request.client?.id === "service" ? null : request.client?.id || null,
      });
      if (permissionError) console.error("Failed to auto-create permission:", permissionError.message);
    }

    await writeAudit("VEHICLE_CREATED", "vehicle", data.id, request, { plateNumber: data.plate_number, customerCode });
    response.status(201).json({ ...data, plateNumber: data.plate_number, vehicleType: data.vehicle_type, ownerName: data.owner_name, houseNo: data.house_no, customerCode: data.customer_code });
  } catch (error) {
    fail(response, 503, error.message);
  }
});

app.patch("/api/vehicles/:id", requireRole("ADMIN"), async (request, response) => {
  try {
    if (!supabaseConfigured) return response.json({ ok: true });
    const body = request.body || {};
    const updates = { updated_at: new Date().toISOString() };
    if (body.status) {
      if (!["AUTHORIZED", "BLOCKED", "EXPIRED", "TEMPORARY"].includes(body.status)) return fail(response, 400, "Invalid status");
      updates.status = body.status;
    }
    if (body.ownerName || body.owner_name) updates.owner_name = body.ownerName || body.owner_name;
    if (body.ownerPhone || body.owner_phone) updates.owner_phone = body.ownerPhone || body.owner_phone;
    if (body.driverName || body.driver_name) updates.driver_name = body.driverName || body.driver_name;
    if (body.driverPhone || body.driver_phone) updates.driver_phone = body.driverPhone || body.driver_phone;
    if (body.vehicleType || body.vehicle_type) updates.vehicle_type = body.vehicleType || body.vehicle_type;
    if (body.make) updates.make = body.make;
    if (body.model) updates.model = body.model;
    if (body.color) updates.color = body.color;
    if (body.normalized_plate || body.normalizedPlate) updates.normalized_plate = normalizePlate(body.normalized_plate || body.normalizedPlate);
    const { data, error } = await supabase.from("vehicles").update(updates).eq("id", request.params.id).select().single();
    if (error) throw error;
    await writeAudit("VEHICLE_UPDATED", "vehicle", data.id, request, { plateNumber: data.plate_number, changes: Object.keys(updates) });
    response.json({ ...data, plateNumber: data.plate_number });
  } catch (error) {
    fail(response, 503, error.message);
  }
});

// ============================================================
// ROUTES: Invitations
// ============================================================
app.get("/api/invitations", async (request, response) => {
  try {
    if (!supabaseConfigured) return response.json([]);
    let builder = supabase.from("invitations").select("*").order("created_at", { ascending: false });
    if (!isAdmin(request)) builder = builder.eq("owner_id", request.client.id);
    if (request.query.plate_number) builder = builder.eq("normalized_plate", normalizePlate(request.query.plate_number));
    if (request.query.status) builder = builder.eq("status", request.query.status);
    const { data, error } = await builder;
    if (error) throw error;
    response.json(data.map((invitation) => ({
      ...invitation,
      plateNumber: invitation.plate_number,
      startAt: invitation.start_at,
      endAt: invitation.end_at,
      person: invitation.person,
      visitorName: invitation.visitor_name || invitation.person,
      purposeDescription: invitation.purpose_description,
      destination: invitation.destination,
      notes: invitation.notes,
      invitedBy: invitation.invited_by_role,
      ownerHouseNo: invitation.owner_house_no,
      duration: Math.max(0, Math.round((new Date(invitation.end_at) - new Date(invitation.start_at)) / 60000)),
    })));
  } catch (error) {
    fail(response, 503, error.message);
  }
});

app.post("/api/invitations", async (request, response) => {
  const body = request.body || {};
  const plate = normalizePlate(body.plateNumber || body.plate_number);
  const start = body.startAt || body.start_at || body.start;
  const end = body.endAt || body.end_at || body.end;
  if (!plate || !start || !end || new Date(end) <= new Date(start)) return fail(response, 400, "A plate and a valid time window are required");
  const purpose = body.purpose || "Guest Visit";
  if (purpose === "Other" && !String(body.purposeDescription || body.customPurpose || "").trim()) return fail(response, 400, "purpose_description is required when purpose is Other");
  if (body.visitorName && body.visitorName.trim().length < 2) return fail(response, 400, "visitor name is too short");
  try {
    const ownerId = isAdmin(request) ? (body.ownerId || body.customerId || request.client.id) : request.client.id;
    const baseInvitation = {
      owner_id: ownerId && ownerId !== "service" ? ownerId : request.client.id,
      plate_number: plate,
      normalized_plate: plate,
      person: body.person || body.visitorName || null,
      owner_house_no: body.ownerHouseNo || body.houseNo || null,
      vehicle_type: body.vehicleType || body.vehicle_type || null,
      purpose,
      start_at: new Date(start).toISOString(),
      end_at: new Date(end).toISOString(),
      status: "ACTIVE",
    };
    const optionalInvitation = {
      visitor_name: body.visitorName || body.person || null,
      purpose_description: body.purposeDescription || body.customPurpose || null,
      destination: body.destination || null,
      notes: body.notes || null,
      invited_by_role: request.client?.role,
    };
    let { data, error } = await supabase.from("invitations").insert({ ...baseInvitation, ...optionalInvitation }).select().single();
    if (error && /column|schema cache|PGRST204/i.test(error.message)) {
      ({ data, error } = await supabase.from("invitations").insert(baseInvitation).select().single());
    }
    if (error) throw error;
    await writeAudit("INVITATION_CREATED", "invitation", data.id, request, { plateNumber: plate, purpose });
    response.status(201).json({
      ...data,
      plateNumber: data.plate_number,
      startAt: data.start_at,
      endAt: data.end_at,
      person: data.person,
      visitorName: data.visitor_name || body.visitorName || body.person || data.person,
      purposeDescription: data.purpose_description || body.purposeDescription || body.customPurpose || null,
      destination: data.destination || body.destination || null,
      notes: data.notes || body.notes || null,
      invitedBy: data.invited_by_role || request.client?.role,
      ownerHouseNo: data.owner_house_no,
      duration: Math.max(0, Math.round((new Date(data.end_at) - new Date(data.start_at)) / 60000)),
    });
  } catch (error) {
    fail(response, 503, error.message);
  }
});

app.patch("/api/invitations/:id/status", requireRole("ADMIN"), async (request, response) => {
  const { status } = request.body || {};
  if (!["ACTIVE", "BLOCKED", "CANCELLED", "EXPIRED"].includes(status)) return fail(response, 400, "Invalid invitation status");
  try {
    if (!supabaseConfigured) return fail(response, 503, "Supabase is not configured");
    const { data, error } = await supabase.from("invitations").update({ status }).eq("id", request.params.id).select().single();
    if (error) throw error;
    await writeAudit(`INVITATION_${status}`, "invitation", data.id, request, { plateNumber: data.plate_number });
    response.json({ ...data, plateNumber: data.plate_number, startAt: data.start_at, endAt: data.end_at });
  } catch (error) {
    fail(response, 503, error.message);
  }
});

// ============================================================
// ROUTES: Permissions
// ============================================================
app.get("/api/permissions", async (request, response) => {
  try {
    if (!supabaseConfigured) return response.json([]);
    const limit = Math.min(Number(request.query.limit) || 1000, 2000);
    let builder = supabase.from("permissions").select("*").order("created_at", { ascending: false }).limit(limit);
    const ownedIds = await ownedVehicleIds(request, request.query.plate_number);
    if (ownedIds && !ownedIds.length) return response.json([]);
    if (ownedIds) builder = builder.in("vehicle_id", ownedIds);
    if (request.query.plate_number) builder = builder.eq("normalized_plate", normalizePlate(request.query.plate_number));
    if (request.query.status) builder = builder.eq("status", request.query.status);
    const { data, error } = await builder;
    if (error) throw error;
    response.json(data.map((permission) => ({ ...permission, plateNumber: permission.plate_number, validDate: permission.valid_date, validFrom: permission.valid_from, validUntil: permission.valid_until, allowedEntryFrom: permission.allowed_entry_from, allowedEntryUntil: permission.allowed_entry_until })));
  } catch (error) {
    if (/PGRST205|Could not find the table/.test(String(error.message))) return response.status(503).json({ error: "permissions table is not migrated. Run supabase/schema.sql in the Supabase SQL Editor to enable permission sync." });
    fail(response, 503, error.message);
  }
});

app.post("/api/permissions", requireRole("ADMIN"), async (request, response) => {
  const body = request.body || {};
  const plate = normalizePlate(body.plateNumber || body.plate_number);
  if (!plate) return fail(response, 400, "A plate number is required");
  if (body.validFrom && body.validUntil && new Date(body.validUntil) <= new Date(body.validFrom)) return fail(response, 400, "valid_until must be after valid_from");
  try {
    const { data, error } = await supabase.from("permissions").insert({
      plate_number: plate,
      normalized_plate: plate,
      vehicle_id: body.vehicle_id || body.vehicleId || null,
      person: body.person || null,
      purpose: body.purpose || "Visitor",
      valid_date: body.validDate || body.valid_date || null,
      valid_from: body.validFrom || body.valid_from || null,
      valid_until: body.validUntil || body.valid_until || null,
      allowed_entry_from: body.allowedEntryFrom || body.allowed_entry_from || null,
      allowed_entry_until: body.allowedEntryUntil || body.allowed_entry_until || null,
      reason: body.reason || null,
      status: body.status || "ACTIVE",
      created_by: request.client?.id === "service" ? null : request.client?.id || null,
    }).select().single();
    if (error) throw error;
    await writeAudit("PERMISSION_CREATED", "permission", data.id, request, { plateNumber: plate });
    response.status(201).json({ ...data, plateNumber: data.plate_number, validDate: data.valid_date, validFrom: data.valid_from, validUntil: data.valid_until });
  } catch (error) {
    if (/PGRST205|Could not find the table/.test(String(error.message))) return response.status(503).json({ error: "permissions table is not migrated. Run supabase/schema.sql in the Supabase SQL Editor to enable permission sync." });
    fail(response, 503, error.message);
  }
});

app.patch("/api/permissions/:id/status", requireRole("ADMIN"), async (request, response) => {
  const { status } = request.body || {};
  if (!["ACTIVE", "BLOCKED", "CANCELLED", "EXPIRED"].includes(status)) return fail(response, 400, "Invalid permission status");
  try {
    if (!supabaseConfigured) return fail(response, 503, "Supabase is not configured");
    const { data, error } = await supabase.from("permissions").update({ status, updated_at: new Date().toISOString() }).eq("id", request.params.id).select().single();
    if (error) throw error;
    await writeAudit(`PERMISSION_${status}`, "permission", data.id, request, { plateNumber: data.plate_number });
    response.json({ ...data, plateNumber: data.plate_number });
  } catch (error) {
    fail(response, 503, error.message);
  }
});

// ============================================================
// ROUTES: Events (Detections)
// ============================================================
app.get("/api/events", async (request, response) => {
  try {
    if (!supabaseConfigured) return response.json(recentEvents(request.query.limit));
    const limit = Math.min(Number(request.query.limit) || 1000, 1000);
    let builder = supabase.from("detections").select("*").order("detected_at", { ascending: false }).limit(limit);
    if (!isAdmin(request)) {
      const { data: ownVehicles } = await supabase.from("vehicles").select("id").eq("customer_id", request.client.id);
      const ids = ownVehicles?.map((vehicle) => vehicle.id) || [];
      const filters = [];
      if (ids.length) filters.push(`vehicle_id.in.(${ids.join(",")})`);
      if (request.client.profile?.plate_number) filters.push(`plate_number.eq.${request.client.profile.plate_number}`);
      if (!filters.length) return response.json([]);
      builder = builder.or(filters.join(","));
    }
    const { data, error } = await builder;
    if (error) throw error;
    response.json(data.map(publicEvent));
  } catch (error) {
    fail(response, 503, error.message);
  }
});

app.post("/api/events", requireRole("ADMIN"), async (request, response) => {
  if (!request.body || typeof request.body !== "object") return response.status(400).json({ error: "Event payload must be an object" });
  try {
    if (isDuplicateEvent(request.body)) return response.status(202).json({ accepted: true, duplicate: true });
    const event = supabaseConfigured ? await persistEvent(request.body) : addEvent(request.body);
    rememberEvent(request.body);
    broadcast({ type: "vehicle_detected", data: event });
    await writeAudit("DETECTION_RECORDED", "detection", event.id, request, { plateNumber: event.plateNumber, cameraId: event.cameraId || request.body.cameraId || "laptop-browser-1", status: event.status });
    response.status(201).json(event);
  } catch (error) {
    fail(response, 503, error.message);
  }
});

// ============================================================
// ROUTES: Visits
// ============================================================
app.get("/api/visits", async (request, response) => {
  try {
    if (!supabaseConfigured) return response.json([]);
    const limit = Math.min(Number(request.query.limit) || 1000, 1000);
    let builder = supabase.from("visits").select("*").order("entry_time", { ascending: false }).limit(limit);
    if (!isAdmin(request)) {
      const { data: ownVehicles } = await supabase.from("vehicles").select("id").eq("customer_id", request.client.id);
      const ids = ownVehicles?.map((vehicle) => vehicle.id) || [];
      const filters = [];
      if (ids.length) filters.push(`vehicle_id.in.(${ids.join(",")})`);
      if (request.client.profile?.plate_number) filters.push(`plate_number.eq.${request.client.profile.plate_number}`);
      if (!filters.length) return response.json([]);
      builder = builder.or(filters.join(","));
    }
    const { data, error } = await builder;
    if (error) throw error;
    response.json(data.map((visit) => ({ ...visit, plateNumber: visit.plate_number, entryTime: visit.entry_time, exitTime: visit.exit_time })));
  } catch (error) {
    fail(response, 503, error.message);
  }
});

// ============================================================
// ROUTES: Alerts
// ============================================================
app.get("/api/alerts", async (request, response) => {
  try {
    if (!supabaseConfigured) return response.json([]);
    let builder = supabase.from("alerts").select("*").order("created_at", { ascending: false }).limit(1000);
    if (!isAdmin(request)) {
      const { data: ownVehicles } = await supabase.from("vehicles").select("id").eq("customer_id", request.client.id);
      const ids = ownVehicles?.map((vehicle) => vehicle.id) || [];
      const { data: ownDetections } = ids.length ? await supabase.from("detections").select("id").in("vehicle_id", ids) : { data: [] };
      const detIds = ownDetections?.map((detection) => detection.id) || [];
      const filters = [];
      if (detIds.length) filters.push(`detection_id.in.(${detIds.join(",")})`);
      if (request.client.profile?.plate_number) filters.push(`plate_number.eq.${request.client.profile.plate_number}`);
      if (!filters.length) return response.json([]);
      builder = builder.or(filters.join(","));
    }
    const { data, error } = await builder;
    if (error) throw error;
    response.json(data.map((alert) => ({ ...alert, plateNumber: alert.plate_number, timestamp: alert.created_at, isRead: alert.is_read, read: alert.is_read })));
  } catch (error) {
    fail(response, 503, error.message);
  }
});

app.post("/api/alerts/:id/read", async (request, response) => {
  try {
    if (!supabaseConfigured) return response.json({ ok: true });
    let builder = supabase.from("alerts").update({ is_read: true, acknowledged_by: request.client?.id === "service" ? null : request.client?.id || null, acknowledged_at: new Date().toISOString() }).eq("id", request.params.id).select().single();
    if (!isAdmin(request)) builder = builder.eq("plate_number", request.client.profile?.plate_number || "__none__");
    const { data, error } = await builder;
    if (error) throw error;
    await writeAudit("ALERT_ACKNOWLEDGED", "alert", data.id, request, { plateNumber: data.plate_number, type: data.type });
    response.json(data);
  } catch (error) {
    fail(response, 503, error.message);
  }
});

// ============================================================
// ROUTES: Dashboard Analytics
// ============================================================
app.get("/api/analytics/dashboard", requireRole("ADMIN"), async (_request, response) => {
  try {
    if (!supabaseConfigured) return response.json(dashboardStats());
    const [{ count: total }, { count: authorized }, { count: unauthorized }, { count: inside }] = await Promise.all([
      supabase.from("detections").select("id", { count: "exact", head: true }),
      supabase.from("detections").select("id", { count: "exact", head: true }).eq("decision", "AUTHORIZED"),
      supabase.from("detections").select("id", { count: "exact", head: true }).eq("decision", "UNAUTHORIZED"),
      supabase.from("visits").select("id", { count: "exact", head: true }).is("exit_time", null),
    ]);
    response.json({ totalToday: total || 0, authorized: authorized || 0, unauthorized: unauthorized || 0, unknown: 0, currentlyInside: inside || 0 });
  } catch (error) {
    fail(response, 503, error.message);
  }
});

// ============================================================
// ROUTES: Password Reset
// ============================================================
app.post("/api/password-reset/request", async (request, response) => {
  const { plateNumber, ownerName } = request.body || {};
  const plate = normalizePlate(plateNumber);
  if (!plate || !ownerName) return fail(response, 400, "Vehicle number and owner name are required");
  try {
    if (!supabaseConfigured) return fail(response, 503, "Supabase is not configured");
    const { data: vehicle, error } = await supabase.from("vehicles").select("*").eq("normalized_plate", plate).maybeSingle();
    if (error) throw error;
    if (!vehicle?.customer_id) return fail(response, 404, "No linked customer account found for this vehicle");
    if (String(vehicle.owner_name || "").trim().toLowerCase() !== String(ownerName).trim().toLowerCase()) return fail(response, 400, "Owner name does not match the registered vehicle");
    const { data, error: insertError } = await supabase.from("password_reset_requests").insert({ customer_id: vehicle.customer_id, plate_number: plate, owner_name: ownerName, status: "PENDING" }).select().single();
    if (insertError) throw insertError;
    await writeAudit("PASSWORD_RESET_REQUESTED", "password_reset_request", data.id, request, { plateNumber: plate });
    response.status(201).json(data);
  } catch (error) {
    fail(response, 503, error.message);
  }
});

app.get("/api/password-reset/requests", (request, response, next) => (supabaseConfigured ? requireRole("ADMIN")(request, response, next) : next()), async (request, response) => {
  try {
    if (!supabaseConfigured) return response.json([]);
    const { data, error } = await supabase.from("password_reset_requests").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    response.json(data);
  } catch (error) {
    fail(response, 503, error.message);
  }
});

app.post("/api/password-reset/:id/resolve", (request, response, next) => (supabaseConfigured ? requireRole("ADMIN")(request, response, next) : next()), async (request, response) => {
  const { action } = request.body || {};
  if (!["APPROVED", "REJECTED"].includes(action)) return fail(response, 400, "action must be APPROVED or REJECTED");
  try {
    if (!supabaseConfigured) return fail(response, 503, "Supabase is not configured");
    const { data: pending, error: fetchError } = await supabase.from("password_reset_requests").select("*").eq("id", request.params.id).eq("status", "PENDING").maybeSingle();
    if (fetchError) throw fetchError;
    if (!pending) return fail(response, 404, "Pending request not found");
    if (action === "APPROVED") {
      const authClient = createAuthClient();
      const { data: account, error: accountError } = await authClient.auth.admin.getUserById(pending.customer_id);
      if (accountError || !account?.user?.email) throw accountError || new Error("Customer account email not found");
      const { error: resetError } = await authClient.auth.resetPasswordForEmail(account.user.email);
      if (resetError) throw resetError;
    }
    const { data, error } = await supabase.from("password_reset_requests").update({ status: action, resolved_by: request.client.id, resolved_at: new Date().toISOString() }).eq("id", pending.id).select().single();
    if (error) throw error;
    await writeAudit(`PASSWORD_RESET_${action}`, "password_reset_request", data.id, request, { customerId: pending.customer_id });
    response.json(data);
  } catch (error) {
    fail(response, 503, error.message);
  }
});

// ============================================================
// ROUTES: Complaints
// ============================================================
app.get("/api/complaints", async (request, response) => {
  try {
    if (!supabaseConfigured) return response.json([]);
    let builder = supabase.from("complaints").select("*").order("created_at", { ascending: false }).limit(500);
    if (!isAdmin(request)) builder = builder.eq("customer_id", request.client.id);
    const { data, error } = await builder;
    if (error) throw error;
    response.json(data);
  } catch (error) {
    fail(response, 503, error.message);
  }
});

app.post("/api/complaints", async (request, response) => {
  const { category, description, vehicleId, plateNumber } = request.body || {};
  if (!["GATE_ISSUE", "WRONG_DETECTION", "OTHER"].includes(category)) return fail(response, 400, "A valid category is required");
  if (!description || !String(description).trim()) return fail(response, 400, "A description is required");
  if (String(description).trim().length > 2000) return fail(response, 400, "A description must be 2,000 characters or fewer");
  try {
    if (!supabaseConfigured) return fail(response, 503, "Supabase is not configured");
    let targetVehicle = null;
    if (!isAdmin(request)) {
      let vehicleQuery = supabase.from("vehicles").select("id, plate_number, normalized_plate").eq("customer_id", request.client.id);
      if (vehicleId) vehicleQuery = vehicleQuery.eq("id", vehicleId);
      else if (plateNumber) vehicleQuery = vehicleQuery.eq("normalized_plate", normalizePlate(plateNumber));
      else return fail(response, 400, "Select one of your registered vehicles");
      const { data, error: vehicleError } = await vehicleQuery.maybeSingle();
      if (vehicleError) throw vehicleError;
      if (!data) return fail(response, 403, "You can submit complaints only for your own vehicles");
      targetVehicle = data;
    }
    const { data, error } = await supabase.from("complaints").insert({
      customer_id: request.client.id,
      vehicle_id: targetVehicle?.id || vehicleId || null,
      plate_number: targetVehicle?.plate_number || normalizePlate(plateNumber) || null,
      category,
      description: String(description).trim(),
      status: "OPEN",
    }).select().single();
    if (error) throw error;
    await writeAudit("COMPLAINT_CREATED", "complaint", data.id, request, { category });
    response.status(201).json(data);
  } catch (error) {
    fail(response, 503, error.message);
  }
});

app.patch("/api/complaints/:id", (request, response, next) => (supabaseConfigured ? requireRole("ADMIN")(request, response, next) : next()), async (request, response) => {
  const { status, adminResponse, replyMessage } = request.body || {};
  const reply = typeof adminResponse === "string" ? adminResponse : typeof replyMessage === "string" ? replyMessage : "";
  if (!["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"].includes(status)) return fail(response, 400, "Invalid status");
  try {
    if (!supabaseConfigured) return response.json({ ok: true });
    const updates = { status };
    if (reply.trim()) updates.admin_response = reply.trim();
    if (status === "REJECTED" && !reply.trim()) updates.admin_response = "Your complaint has been reviewed and rejected. Please contact support for clarification.";
    const { data, error } = await supabase.from("complaints").update(updates).eq("id", request.params.id).select().single();
    if (error) throw error;
    await writeAudit("COMPLAINT_STATUS_CHANGED", "complaint", data.id, request, { status, adminResponse: updates.admin_response || null });
    response.json(data);
  } catch (error) {
    fail(response, 503, error.message);
  }
});

// ============================================================
// ERROR HANDLER
// ============================================================
app.use((error, _request, response, _next) => fail(response, 500, error.message));

// ============================================================
// VISIT AUTO-CLOSE (inactive sessions)
// ============================================================
const VISIT_CLOSE_AFTER_MS = Number(process.env.VISIT_CLOSE_AFTER_MS || 120000);
if (supabaseConfigured) setInterval(async () => {
  const cutoff = new Date(Date.now() - VISIT_CLOSE_AFTER_MS);

  // Close inactive visits
  const { data: visits } = await supabase.from("visits").select("id, last_seen_at, entry_time").is("exit_time", null).lt("last_seen_at", cutoff.toISOString()).limit(100);
  for (const visit of visits || []) {
    const exitTime = new Date(visit.last_seen_at || cutoff);
    const durationMinutes = Math.max(0, Math.round((exitTime - new Date(visit.entry_time)) / 60000));
    await supabase.from("visits").update({ exit_time: exitTime.toISOString(), duration_minutes: durationMinutes }).eq("id", visit.id);
  }

  // Close inactive vehicle sessions
  const { data: sessions } = await supabase.from("vehicle_sessions").select("id, session_start, entry_time, last_seen_at").eq("status", "ACTIVE").lt("last_seen_at", cutoff.toISOString()).limit(100);
  for (const session of sessions || []) {
    const exitTime = new Date(session.last_seen_at || cutoff);
    const entryTime = new Date(session.entry_time || session.session_start || session.last_seen_at);
    const durationMinutes = Math.max(0, Math.round((exitTime - entryTime) / 60000));
    await supabase.from("vehicle_sessions").update({ session_end: exitTime.toISOString(), exit_time: exitTime.toISOString(), duration_minutes: durationMinutes, status: "CLOSED", closed_reason: "inactive_timeout" }).eq("id", session.id);
  }
}, 30000);

// ============================================================
// RETENTION + EXPIRY (Policy B: auto-delete records > 31 days)
// ============================================================
if (supabaseConfigured) setInterval(async () => {
  const now = new Date().toISOString();
  try {
    await supabase.from("invitations").update({ status: "EXPIRED", updated_at: now }).eq("status", "ACTIVE").lt("end_at", now);
    await supabase.from("permissions").update({ status: "EXPIRED", updated_at: now }).eq("status", "ACTIVE").lt("valid_until", now).not("valid_until", "is", null);
  } catch (error) {
    console.error("Expiry sweep failed:", error.message);
  }
  try {
    await supabase.rpc("cleanup_old_records", {});
  } catch (error) {
    if (!/function cleanup_old_records|Could not find the function/.test(String(error.message))) console.error("Retention sweep failed:", error.message);
  }
}, Number(process.env.RETENTION_INTERVAL_MS || 6 * 60 * 60 * 1000));

// Immediately run the retention sweep once at boot
if (supabaseConfigured) { setTimeout(async () => { try { await supabase.rpc("cleanup_old_records", {}); } catch { /* migration not applied yet */ } }, 15000); }

// ============================================================
// WEBSOCKET
// ============================================================
websocketServer.on("connection", async (socket) => {
  sockets.add(socket);
  try {
    const data = supabaseConfigured ? await supabase.from("detections").select("*").order("detected_at", { ascending: false }).limit(20) : recentEvents();
    socket.send(JSON.stringify({ type: "snapshot", data: data.slice(0, 20) }));
  } catch {
    socket.send(JSON.stringify({ type: "snapshot", data: [] }));
  }
  socket.on("close", () => sockets.delete(socket));
});

server.on("upgrade", async (request, socket, head) => {
  const token = new URL(request.url, `http://${request.headers.host}`).searchParams.get("token");
  let valid = !supabaseConfigured;
  if (supabaseConfigured) {
    if (SERVICE_TOKEN && token === SERVICE_TOKEN) valid = true;
    else if (token) { const { data } = await supabase.auth.getUser(token); valid = Boolean(data?.user); }
  }
  if (!valid) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  websocketServer.handleUpgrade(request, socket, head, (ws) => websocketServer.emit("connection", ws, request));
});
