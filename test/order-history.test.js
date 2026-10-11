import test from "node:test";
import assert from "node:assert/strict";
import { filterOrderHistory, historyStatus, historyDay, paymentReceipts } from "../public/order-history.js";
import { paymentReceiptHtml } from "../public/payment-documents.js";
import { migrateOrderHistoryAccess, ROLE_PRESETS } from "../lib/access.js";

test("history retains one invoice for distinct jobs and filters every historical stage", () => {
  const order = { id: "one", code: "INV-01", createdAt: "2026-10-10T17:00:00Z", customerName: "Customer", phone: "08123", total: 100, paidAmount: 30, paymentConfirmed: true, status: "DESAIN", items: [{ productName: "Mug", status: "DESAIN" }, { productName: "Mug", status: "FINISHING" }] };
  const old = { ...order, id: "old", code: "INV-OLD", status: "DIAMBIL", createdAt: "2025-01-01T01:00:00Z", items: [{ productName: "Spanduk", status: "DIAMBIL" }], paidAmount: 100 };
  assert.equal(filterOrderHistory([order, old], { q: "mug", status: "FINISHING" }).length, 1);
  assert.deepEqual(filterOrderHistory([order, old], { q: "INV-OLD", payment: "LUNAS" }).map(o => o.id), ["old"]);
  assert.deepEqual(filterOrderHistory([order, old], { from: "2026-10-11", to: "2026-10-11" }).map(o => o.id), ["one"]);
  assert.equal(historyDay(order.createdAt), "2026-10-11");
  assert.equal(filterOrderHistory([{ ...order, status: "DRAFT" }], { status: "DRAFT" }).length, 1);
  assert.equal(historyStatus(order, { DESAIN: "Design", FINISHING: "Finishing" }), "Sedang diproses · 1 Design · 1 Finishing");
  assert.equal(filterOrderHistory([{ ...order, status: "MENUNGGU_PEMBAYARAN", paymentConfirmed: false, paidAmount: 0 }], { status: "DRAFT" }).length, 1);
});

test("payment receipts preserve transaction-time balances and skip PO", () => {
  const order = { id: "invoice", code: "INV", customerName: "<script>", paidAmount: 100, total: 100, payments: [{ type: "PO", amount: 0 }, { id: "DP", amount: 30, method: "TUNAI", createdAt: "2026-10-11T00:00:00Z", orderTotal: 100, paidBefore: 0, paidAfter: 30, balanceAfter: 70, actor: "Kasir" }, { id: "PAID", amount: 70, method: "QRIS", createdAt: "2026-10-11T01:00:00Z", orderTotal: 100, paidBefore: 30, paidAfter: 100, balanceAfter: 0 }] };
  const receipts = paymentReceipts(order);
  assert.equal(receipts.length, 2);
  assert.equal(receipts[0].balanceAfter, 70);
  assert.equal(receipts[1].paidBefore, 30);
  assert.equal(receipts[1].balanceAfter, 0);
  order.total = 200;
  assert.equal(paymentReceipts(order)[0].orderTotal, 100);
  const html = paymentReceiptHtml(order, receipts[0]);
  assert.ok(html.includes("&lt;script&gt;")); assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("Sisa saat transaksi")); assert.ok(!html.includes("/ PELUNASAN"));
  assert.ok(paymentReceiptHtml(order, receipts[1]).includes("/ PELUNASAN"));
});

test("legacy receipts have stable references and reconstruct opening balance without altering ledger", () => {
  const order = { id: "old", total: 100, paidAmount: 80, payments: [{ amount: 30 }, { amount: 20 }] };
  const before = structuredClone(order);
  assert.deepEqual(paymentReceipts(order).map(p => [p.id, p.paidBefore, p.paidAfter, p.balanceAfter]), [["old-payment-1", 30, 60, 40], ["old-payment-2", 60, 80, 20]]);
  assert.deepEqual(order, before);
});

test("history permission migration upgrades old presets, preserves custom grants and operator permissions", () => {
  const state = { users: ["OWNER", "ADMIN", "CASHIER", "MANAGER", "DESIGN", "PRINT"].map(role => ({ role, permissions: ROLE_PRESETS[role].permissions.filter(id => !id.startsWith("orders.")) })) };
  state.users.push({ role: "CASHIER", permissions: ["pos.view"] });
  migrateOrderHistoryAccess(state);
  for (const user of state.users.slice(0, 4)) assert.ok(user.permissions.includes("orders.pickup"));
  for (const user of state.users.slice(4, 6)) assert.ok(!user.permissions.includes("orders.view"));
  assert.deepEqual(state.users[6].permissions, ["pos.view"]);
  assert.ok(!state.users[2].permissions.includes("projects.status"));
  const before = structuredClone(state); migrateOrderHistoryAccess(state); assert.deepEqual(state, before);
});
