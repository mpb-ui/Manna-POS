import { finishedItem, nextItemStatus, refreshOrderWorkflow } from "../public/item-workflow.js";
import { STATUS_LABEL } from "./domain.js";
import { allowedStatusForRole, canRequestStatus, hasPermission, orderVisibleToUser } from "./access.js";
import { cancelled } from "../public/order-rules.js";
import { ensureShirtStock } from "./dtf-stock.js";
import { commitPhysicalStock } from "./physical-stock.js";

export function commitOrderStock(state, order, now, { itemIds = null, actor = "Sistem" } = {}) {
  const selected = order.items.filter(item => !item.stockCommitted && item.stockTiming !== "SALE" && (!itemIds || itemIds.includes(item.itemId)) && ["CETAK", "FINISHING", "SELESAI", "DIAMBIL"].includes(item.status));
  if (!selected.length) return;
  ensureShirtStock(state, { ...order, items: selected }, { physical: true });
  commitPhysicalStock(state, order, { itemIds: selected.map(item => item.itemId), actor, timestamp: now() });
}

export function registerItemWorkflowRoutes(app, { store, requirePermission, normalizeOrder, sanitizeOrder, activity, audit, now }) {
  const findJob = (state, req) => {
    const order = state.orders.find(order => order.id === req.params.id);
    if (!order || !orderVisibleToUser(order, req.user)) throw new Error("Pesanan tidak ditemukan");
    normalizeOrder(order);
    const item = order.items.find(item => item.itemId === req.params.itemId);
    if (!item) throw new Error("Produk pesanan tidak ditemukan");
    return { order, item };
  };
  const run = mutate => async (req, res, next) => {
    try { res.json(await store.mutate(state => mutate(state, req))); }
    catch (error) {
      if (["ORDER_HELD", "STALE_ITEM_STATUS"].includes(error.code)) return res.status(409).json({ error: error.message, code: error.code });
      next(error);
    }
  };
  const route = "/api/orders/:id/items/:itemId";
  app.patch(`${route}/design-pic`, requirePermission("projects.assign"), run((state, req) => {
    const { order, item } = findJob(state, req);
    if (!["DESAIN", "CETAK", "FINISHING", "SELESAI"].includes(item.status)) throw new Error("PIC hanya dapat ditetapkan pada produk aktif");
    const pic = state.pics.find(pic => pic.name === String(req.body.designPic || "").trim() && pic.active !== false && !pic.deletedAt);
    if (!pic) throw new Error("PIC tidak tersedia");
    if (item.designPicId === pic.id && item.designPic === pic.name) return sanitizeOrder(order, req.user);
    const previous = item.designPic || null;
    item.designPic = pic.name; item.designPicId = pic.id; item.designPicColor = pic.color; item.updatedAt = now();
    refreshOrderWorkflow(order, now());
    activity(state, order, `PIC ${item.productName} (item ${order.items.indexOf(item) + 1}): ${previous || "Belum ditetapkan"} → ${pic.name}`, req.user.name, { itemId: item.itemId, productName: item.productName });
    audit(state, req.user, "ORDER_ITEM_PIC", `Mengubah PIC produk ${order.code}`, { orderId: order.id, itemId: item.itemId, previous, designPicId: pic.id });
    return sanitizeOrder(order, req.user);
  }));
  app.patch(`${route}/deadline`, (req, res, next) => {
    if (!["OWNER", "CASHIER", "MANAGER"].includes(req.user.role) || req.user.role === "MANAGER" && !hasPermission(req.user, "pos.edit")) return res.status(403).json({ error: "Deadline hanya dapat diubah Owner, Kasir, atau Manager dengan akses edit pesanan" });
    next();
  }, run((state, req) => {
    const { order, item } = findJob(state, req);
    const value = req.body.deadline;
    if (value !== null && value !== "" && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) || !Number.isFinite(Date.parse(value)))) throw new Error("Tanggal dan jam deadline tidak valid");
    const deadline = value ? new Date(value).toISOString() : null;
    if (item.deadline === deadline) return sanitizeOrder(order, req.user);
    const previous = item.deadline;
    const format = value => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar" }).format(new Date(value)) + " WITA" : "Tidak ditentukan";
    item.deadline = deadline; item.updatedAt = now(); refreshOrderWorkflow(order, now());
    activity(state, order, `Deadline ${item.productName} (item ${order.items.indexOf(item) + 1}): ${format(previous)} → ${format(deadline)}`, req.user.name, { itemId: item.itemId, productName: item.productName });
    audit(state, req.user, "ORDER_ITEM_DEADLINE", `Mengubah deadline produk ${order.code}`, { orderId: order.id, itemId: item.itemId, previousDeadline: previous, deadline });
    return sanitizeOrder(order, req.user);
  }));
  app.patch(`${route}/status`, (req, res, next) => {
    if (!canRequestStatus(req.user, req.body.status)) return res.status(403).json({ error: "Anda tidak memiliki akses mengubah status ini" });
    next();
  }, run((state, req) => {
    const { order, item } = findJob(state, req), target = req.body.status;
    if (cancelled(order)) throw new Error("Pesanan dibatalkan tidak dapat diproses");
    if (order.hold) { const error = new Error("Pesanan masih tertahan. Lepaskan penanda setelah kendala selesai."); error.code = "ORDER_HELD"; throw error; }
    if (req.body.expectedStatus && req.body.expectedStatus !== item.status) { const error = new Error("Status produk telah berubah. Muat ulang pesanan."); error.code = "STALE_ITEM_STATUS"; throw error; }
    if (!order.paymentConfirmed || !["DESAIN", "CETAK", "FINISHING"].includes(item.status) || target !== nextItemStatus(item)) throw new Error("Perpindahan status produk tidak valid");
    if (!allowedStatusForRole(req.user.role, item.status, target)) throw new Error("Role Anda tidak dapat memindahkan status ini");
    if (item.status === "DESAIN" && !item.designPic) throw new Error("Nama PIC Operator Design wajib diisi");
    const previous = item.status;
    item.status = target; item.statusEnteredAt = now(); item.updatedAt = now();
    refreshOrderWorkflow(order, now()); commitOrderStock(state, order, now, { itemIds: [item.itemId], actor: req.user.name });
    activity(state, order, `${item.productName} (item ${order.items.indexOf(item) + 1}): ${STATUS_LABEL[previous]} → ${STATUS_LABEL[target]}`, req.user.name, { itemId: item.itemId, productName: item.productName });
    audit(state, req.user, "ORDER_ITEM_STATUS", `Mengubah status produk ${order.code}`, { orderId: order.id, itemId: item.itemId, previousStatus: previous, status: target });
    return sanitizeOrder(order, req.user);
  }));
}
