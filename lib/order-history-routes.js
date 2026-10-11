import { filterOrderHistory, historyDraft, paymentReceipts } from "../public/order-history.js";
import { hasPermission } from "./access.js";
import { cancelled } from "../public/order-rules.js";

export function registerOrderHistoryRoutes(app, { store, requirePermission, normalizeOrder, sanitizeOrder }) {
  app.get("/api/order-history", requirePermission("orders.view"), async (req, res, next) => {
    try {
      const money = hasPermission(req.user, "projects.money");
      if (req.query.payment && !money) return res.status(403).json({ error: "Akses nominal pembayaran tidak diizinkan" });
      for (const key of ["from", "to"]) if (req.query[key] && !/^\d{4}-\d{2}-\d{2}$/.test(req.query[key])) return res.status(400).json({ error: "Tanggal filter tidak valid" });
      if (req.query.from && req.query.to && req.query.from > req.query.to) return res.status(400).json({ error: "Rentang tanggal tidak valid" });
      const state = await store.read();
      const orders = filterOrderHistory(state.orders.map(normalizeOrder), req.query);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));
      const pages = Math.max(1, Math.ceil(orders.length / pageSize));
      const page = Math.min(pages, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
      const summary = { orders: orders.length };
      if (money) summary.outstanding = orders.filter(order => !historyDraft(order) && !cancelled(order)).reduce((sum, order) => sum + Math.max(0, Number(order.total || 0) - Number(order.paidAmount || 0)), 0);
      // A compact projection avoids shipping attachments and full timelines on every page.
      const rows = orders.slice((page - 1) * pageSize, page * pageSize).map(order => {
        const safe = sanitizeOrder(order, req.user);
        return Object.fromEntries(["id", "code", "createdAt", "customerName", "phone", "status", "deadline", "confirmed", "confirmedAt", "hold", "total", "paidAmount", "paymentConfirmed", "paymentStatus"].filter(key => key in safe).map(key => [key, safe[key]]).concat([["items", safe.items.map(item => ({ productName: item.productName, displaySize: item.displaySize, status: item.status, quantity: item.quantity, unitName: item.unitName }))]]));
      });
      res.json({ orders: rows, summary, page, pages, pageSize, money });
    } catch (error) { next(error); }
  });
  app.get("/api/order-history/:id", requirePermission("orders.view"), async (req, res, next) => {
    try {
      const order = (await store.read()).orders.find(order => order.id === req.params.id);
      if (!order) return res.status(404).json({ error: "Pesanan tidak ditemukan" });
      res.json(sanitizeOrder(normalizeOrder(order), req.user));
    } catch (error) { next(error); }
  });
  app.get("/api/order-history/:id/payments/:paymentId", requirePermission("orders.view"), requirePermission("projects.money"), async (req, res, next) => {
    try {
      const order = (await store.read()).orders.find(order => order.id === req.params.id);
      const payment = order && paymentReceipts(order).find(payment => payment.id === req.params.paymentId);
      if (!payment) return res.status(404).json({ error: "Bukti pembayaran tidak ditemukan" });
      const { poAttachment, ...receipt } = payment;
      res.json({ invoice: order.code, customerName: order.customerName, phone: order.phone, payment: receipt });
    } catch (error) { next(error); }
  });
}
