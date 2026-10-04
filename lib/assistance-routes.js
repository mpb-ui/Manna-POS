import { hasPermission, orderVisibleToUser } from "./access.js";
import { calculateOrder } from "./domain.js";
import { FILE_READINESS, cancelled, unconfirmedDraft, witaDay } from "../public/order-rules.js";
import { assistanceForOrder, briefingForUser, claimBriefing, checklistForOrder, stockReadiness, lastCustomerOrder, repeatQuote } from "./order-assistance.js";

export function registerAssistanceRoutes(app, store, { activity, audit, normalizeOrder }) {
  const route = (method, path, handler) => app[method](path, async (req, res, next) => {
    try { res.json(await handler(req)); } catch (error) { if (error.status) res.status(error.status).json({ error: error.message }); else next(error); }
  });
  const deny = () => { throw Object.assign(new Error("Anda tidak memiliki akses untuk tindakan ini"), { status: 403 }); };
  function findOrder(state, req) {
    const order = state.orders.find(o => o.id === req.params.id && orderVisibleToUser(o, req.user));
    if (!order) throw Object.assign(new Error("Pesanan tidak ditemukan"), { status: 404 });
    normalizeOrder(order); return order;
  }
  function editor(req) { if (!["projects.assign", "projects.status", "pos.edit"].some(permission => hasPermission(req.user, permission))) deny(); }
  function pos(req) { if (!hasPermission(req.user, "pos.view") || !hasPermission(req.user, "pos.create")) deny(); }
  route("get", "/api/briefing", async req => briefingForUser(await store.read(), req.user));
  route("post", "/api/briefing/open", req => store.mutate(state => claimBriefing(state, req.user.id)));
  route("post", "/api/briefing/read", req => store.mutate(state => {
    const user = state.users.find(u => u.id === req.user.id), date = witaDay();
    // A stale tab must not mark tomorrow's briefing read across WITA midnight.
    if (req.body.date !== date) throw new Error("Tanggal briefing berubah. Buka kembali briefing hari ini.");
    user.briefingState = { date, shownAt: user.briefingState?.date === date ? user.briefingState.shownAt || new Date().toISOString() : new Date().toISOString(), readAt: new Date().toISOString() };
    return { ok: true, date };
  }));
  route("get", "/api/repeat-order", async req => {
    pos(req); return lastCustomerOrder(await store.read(), req.user, String(req.query.customerName || "").slice(0,200), String(req.query.phone || "").slice(0,50));
  });
  route("post", "/api/orders/check", async req => {
    pos(req); const state = await store.read();
    const items = req.body.items;
    if (!Array.isArray(items) || items.length > 500) throw new Error("Daftar produk tidak valid");
    let excludeOrderId;
    if (req.body.editingOrderId) {
      const order = state.orders.find(o => o.id === req.body.editingOrderId && orderVisibleToUser(o, req.user));
      if (!order || !hasPermission(req.user, "pos.edit")) deny();
      excludeOrderId = order.id;
    }
    const quote = calculateOrder(state.products.filter(p => p.active !== false && !p.deletedAt), items);
    return { total: quote.total, stock: stockReadiness(state, { items: quote.items }, { excludeOrderId }) };
  });
  route("post", "/api/orders/:id/repeat", async req => {
    pos(req); const state = await store.read(), order = findOrder(state, req);
    if (cancelled(order) || unconfirmedDraft(order)) throw new Error("Pesanan batal atau draft tidak dapat dijadikan repeat order");
    return repeatQuote(state, order, req.user);
  });
  route("get", "/api/orders/:id/assistance", async req => {
    const state = await store.read(), order = findOrder(state, req);
    const data = assistanceForOrder(state, order);
    if (hasPermission(req.user, "projects.money")) data.outstanding = Math.max(0, Number(order.total || 0) - Number(order.paidAmount || 0));
    return data;
  });
  route("patch", "/api/orders/:id/hold", req => {
    editor(req); return store.mutate(state => {
      const order = findOrder(state, req);
      if (cancelled(order) || !["DESAIN", "CETAK", "FINISHING"].includes(order.status)) throw new Error("Penanda tertahan hanya tersedia untuk pesanan dalam produksi");
      const release = req.body.release === true, reason = String(req.body.reason || "").trim(), note = String(req.body.note || "").trim();
      if (!release && (!reason || reason.length > 160 || note.length > 1000)) throw new Error("Isi alasan tertahan (maksimal 160 karakter) dan catatan maksimal 1.000 karakter");
      if (release && !order.hold) return assistanceForOrder(state, order);
      const timestamp = new Date().toISOString(), previous = order.hold;
      order.hold = release ? null : { reason, note, since: previous?.since || timestamp, actor: req.user.name, userId: req.user.id, updatedAt: timestamp };
      order.updatedAt = timestamp;
      activity(state, order, release ? `Penanda tertahan dilepas: ${previous.reason}` : `Pesanan tertahan: ${reason}${note ? ` · ${note}` : ""}`, req.user.name);
      audit(state, req.user, "ORDER_HOLD", `Memperbarui penanda tertahan ${order.code}`, { orderId: order.id, release, reason });
      return assistanceForOrder(state, order);
    });
  });
  route("patch", "/api/orders/:id/file-readiness", req => {
    editor(req); return store.mutate(state => {
      const order = findOrder(state, req), value = req.body.fileReadiness;
      if (cancelled(order)) throw new Error("Pesanan batal tidak dapat diperbarui");
      if (!FILE_READINESS.includes(value)) throw new Error("Status kesiapan file tidak valid");
      if (order.fileReadiness === value) return assistanceForOrder(state, order);
      const names = { UNCONFIRMED: "Belum dikonfirmasi", MISSING: "Belum ada file", RECEIVED: "Sudah diterima", READY: "Siap cetak" };
      order.fileReadiness = value; order.updatedAt = new Date().toISOString();
      activity(state, order, `Kesiapan file: ${names[value]}`, req.user.name);
      audit(state, req.user, "ORDER_FILE_READINESS", `Memperbarui kesiapan file ${order.code}`, { orderId: order.id, value });
      return assistanceForOrder(state, order);
    });
  });
  route("patch", "/api/orders/:id/checklist", req => {
    if (!hasPermission(req.user, "projects.status")) deny();
    return store.mutate(state => {
      const order = findOrder(state, req), index = req.body.index, key = req.body.key;
      if (cancelled(order)) throw new Error("Pesanan batal tidak dapat diperbarui");
      const step = checklistForOrder(order, state.products).find(item => item.index === index)?.steps.find(s => s.key === key);
      if (!Number.isSafeInteger(index) || index < 0 || !step || typeof req.body.done !== "boolean") throw new Error("Langkah checklist tidak valid untuk produk ini");
      if (step.done === req.body.done) return assistanceForOrder(state, order);
      const timestamp = new Date().toISOString();
      order.productionChecks ||= {}; order.productionChecks[index] ||= {};
      order.productionChecks[index][key] = { done: req.body.done, actor: req.user.name, userId: req.user.id, checkedAt: timestamp };
      order.updatedAt = timestamp;
      activity(state, order, `Checklist ${order.items[index].productName}: ${step.label} — ${req.body.done ? "sudah diperiksa" : "dibuka kembali"}`, req.user.name);
      audit(state, req.user, "ORDER_CHECKLIST", `Memperbarui checklist ${order.code}`, { orderId: order.id, index, key, done: req.body.done });
      return assistanceForOrder(state, order);
    });
  });
}
