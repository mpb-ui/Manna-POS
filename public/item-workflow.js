// Shared by the browser and server. An itemId identifies an order line, not a
// catalog product: two lines for the same product can have different jobs.
export const WORKFLOW_STATUSES = ["MENUNGGU_PEMBAYARAN", "DESAIN", "CETAK", "FINISHING", "SELESAI", "DIAMBIL"];
export const finishedItem = item => ["SELESAI", "DIAMBIL"].includes(item.status);
export const nextItemStatus = item => WORKFLOW_STATUSES[WORKFLOW_STATUSES.indexOf(item.status) + 1] || null;

export function initializeOrderItems(order) {
  const used = new Set();
  (order.items || []).forEach((item, index) => {
    if (!item.itemId || used.has(item.itemId)) {
      let suffix = index + 1;
      while (used.has(`${order.id}-item-${suffix}`)) suffix += 1;
      item.itemId = `${order.id}-item-${suffix}`;
    }
    used.add(item.itemId);
    item.status ??= order.status;
    item.designPic ??= order.designPic || "";
    item.designPicId ??= order.designPicId || "";
    item.designPicColor ??= order.designPicColor || picColor(item);
    if (!Object.hasOwn(item, "deadline")) item.deadline = order.deadline || null;
    item.statusEnteredAt ??= order.statusEnteredAt || order.createdAt;
    item.updatedAt ??= order.updatedAt || order.createdAt;
  });
  // Migrate an old invoice hold once, preserving it on unfinished jobs only.
  if (order.hold && !order.itemHoldVersion) {
    for (const item of order.items || []) if (!finishedItem(item) && !Object.hasOwn(item, "hold")) item.hold = structuredClone(order.hold);
    order.itemHoldVersion = 1;
  }
  for (const item of order.items || []) {
    if (order.itemHoldVersion) item.hold ??= null;
    if (finishedItem(item) && !item.completedAt) {
      const entry = (order.timeline || []).find(row => row.itemId === item.itemId && /→ Selesai|menjadi Selesai/.test(row.message || ""));
      const completedAt = entry?.createdAt || (item.status === "SELESAI" ? item.statusEnteredAt : null);
      if (completedAt) item.completedAt = completedAt;
    }
  }
  return order;
}

export function refreshOrderHold(order) {
  order.itemHoldVersion = 1;
  order.hold = order.items?.find(item => item.hold && !finishedItem(item))?.hold || null;
}

export function initializeItemWorkflow(state) {
  (state.orders || []).forEach(initializeOrderItems);
}

export function refreshOrderWorkflow(order, at) {
  if (!order.items?.length) return order;
  const status = order.items.reduce((current, item) => WORKFLOW_STATUSES.indexOf(item.status) < WORKFLOW_STATUSES.indexOf(current) ? item.status : current, order.items[0].status);
  if (status !== order.status) { order.status = status; order.statusEnteredAt = at; }
  const relevant = order.items.filter(item => !finishedItem(item));
  const jobs = relevant.length ? relevant : order.items;
  order.deadline = jobs.map(item => item.deadline).filter(value => value && Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(a) - Date.parse(b))[0] || null;
  const names = [...new Set(jobs.map(item => item.designPic).filter(Boolean))];
  order.designPic = names.join(" / ");
  order.designPicId = names.length === 1 ? jobs.find(item => item.designPic === names[0])?.designPicId || "" : "";
  order.updatedAt = at;
  return order;
}

export function projectJobs(orders) {
  return orders.flatMap(order => (order.items || []).map((item, index) => ({
    ...order, items: [item], itemId: item.itemId || `${order.id}-item-${index + 1}`,
    status: item.status ?? order.status, designPic: item.designPic ?? order.designPic ?? "",
    designPicId: item.designPicId ?? order.designPicId ?? "",
    deadline: Object.hasOwn(item, "deadline") ? item.deadline : order.deadline,
    hold: Object.hasOwn(item, "hold") ? item.hold : order.itemHoldVersion ? null : order.hold || null, completedAt: item.completedAt || null,
    statusEnteredAt: item.statusEnteredAt || order.statusEnteredAt || order.createdAt
  })));
}

export function roleCanAdvance(role, current, target) {
  if (["OWNER", "ADMIN", "MANAGER"].includes(role)) return true;
  if (role === "CASHIER") return current === "FINISHING" && target === "SELESAI" || current === "SELESAI" && target === "DIAMBIL";
  if (role === "DESIGN") return current === "DESAIN" && target === "CETAK";
  if (role === "PRINT") return ["CETAK", "FINISHING"].includes(current) && ["FINISHING", "SELESAI"].includes(target);
  return false;
}

export function itemQuantityLabel(item) {
  const historical = String(item.displaySize || "").match(/\d+(?:[.,]\d+)?\s+(Lembar|Lbr|Box|Pcs|Unit|Produk|Buah|Kaos|Set|Pack|Roll|Rim)\b/i)?.[1];
  const unit = item.unitName || item.saleUnit || historical || (item.priceBasis === "unit" ? "Pcs" : "Lembar");
  const label = { lbr: "Lembar", lembar: "Lembar", pcs: "Pcs", box: "Box", unit: "Unit", produk: "Produk", buah: "Buah", kaos: "Kaos" }[String(unit).toLowerCase()] || unit;
  return `${Number(item.quantity || 1).toLocaleString("id-ID")} ${label}`;
}

export function picColor(item) {
  const known = { Gema: "yellow", Qori: "green", "Cc/Ko": "blue" };
  const palette = ["purple", "rose", "teal", "blue", "green", "yellow"];
  return item.designPicColor || known[item.designPic || item.name] || palette[[...String(item.designPicId || item.id || item.designPic || item.name || "")].reduce((sum, c) => sum + c.charCodeAt(0), 0) % palette.length];
}
