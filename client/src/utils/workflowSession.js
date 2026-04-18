export const TABLE_KEY = "tableId";
export const AFTER_ORDER_PREFIX = "afterOrderActiveOrders:";

export function getAfterOrderStorageKey(tableId) {
  return `${AFTER_ORDER_PREFIX}${tableId}`;
}

export function readStoredOrderIds(tableId) {
  if (!tableId) return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(getAfterOrderStorageKey(tableId)) || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function writeStoredOrderIds(tableId, orderIds) {
  if (!tableId) return;
  localStorage.setItem(getAfterOrderStorageKey(tableId), JSON.stringify((orderIds || []).filter(Boolean)));
}

export function clearWorkflowClientState() {
  const keysToRemove = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    if (key === TABLE_KEY || key.startsWith(AFTER_ORDER_PREFIX)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

export function hydrateWorkflowClientState(workflow) {
  clearWorkflowClientState();

  if (!workflow?.tableId) {
    return;
  }

  localStorage.setItem(TABLE_KEY, workflow.tableId);
  if (Array.isArray(workflow.activeOrderIds) && workflow.activeOrderIds.length > 0) {
    writeStoredOrderIds(workflow.tableId, workflow.activeOrderIds);
  }
}

function sanitizeRouteState(routeState) {
  if (routeState == null) return null;
  try {
    return JSON.parse(JSON.stringify(routeState));
  } catch {
    return null;
  }
}

export function getWorkflowRouteTarget(workflow) {
  if (!workflow?.pathname) return null;
  return {
    pathname: workflow.pathname,
    search: workflow.search || "",
    hash: workflow.hash || "",
    state: workflow.routeState ?? null,
  };
}

export function toPath(route) {
  return `${route?.pathname || ""}${route?.search || ""}${route?.hash || ""}`;
}

export function buildWorkflowPayload({
  pathname,
  search = "",
  hash = "",
  routeState = null,
  roleScope = "user",
  currentStep = null,
  tableId,
  activeOrderIds,
  paymentPending = false,
}) {
  const resolvedTableId = tableId || localStorage.getItem(TABLE_KEY) || null;
  const resolvedOrderIds = Array.isArray(activeOrderIds)
    ? activeOrderIds.filter(Boolean)
    : readStoredOrderIds(resolvedTableId);

  return {
    pathname,
    search,
    hash,
    routeState: sanitizeRouteState(routeState),
    roleScope,
    currentStep,
    tableId: resolvedTableId,
    activeOrderIds: resolvedOrderIds,
    paymentPending,
    status: "active",
  };
}
