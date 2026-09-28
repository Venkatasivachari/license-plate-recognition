const events = [];

export function addEvent(event) {
  const record = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...event,
  };
  events.unshift(record);
  events.splice(100);
  return record;
}

export function recentEvents(limit = 20) {
  return events.slice(0, Math.min(Number(limit) || 20, 100));
}

export function dashboardStats() {
  const today = new Date().toISOString().slice(0, 10);
  const todayEvents = events.filter((event) => event.timestamp.startsWith(today));
  return {
    totalToday: todayEvents.length,
    authorized: todayEvents.filter((event) => event.decision === "AUTHORIZED").length,
    unauthorized: todayEvents.filter((event) => event.status === "UNAUTHORIZED").length,
    unknown: todayEvents.filter((event) => event.decision === "UNKNOWN").length,
    currentlyInside: 0,
  };
}
