import test from "node:test";
import assert from "node:assert/strict";
import { filterOrderHistory, historyStatus, historyDay, paymentReceipts, historyStatusSummary, historyPaymentMethods } from "../public/order-history.js";
import { paymentReceiptHtml } from "../public/payment-documents.js";
import { migrateOrderHistoryAccess, ROLE_PRESETS } from "../lib/access.js";

test("history retains one invoice for distinct jobs and filters every historical stage", () => {
  const order = { id: "one", code: "INV-01", createdAt: "2026-10-10T17:00:00Z", customerName: "Customer", phone: "08123", total: 100, paidAmount: 30, paymentConfirmed: true, status: "DESAIN", items: [{ productName: "Mug", status: "DESAIN" }, { productName: "Mug", status: "FINISHING" }] };
  const old = { ...order, id: "old", code: "INV-OLD", status: "DIAMBIL", createdAt: "2025-01-01T01:00:00Z", items: [{ productName: "Spanduk", status: "DIAMBIL" }], paidAmount: 100 };
  assert.equal(filterOrderHistory([order, old], { q: "customer", status: "FINISHING" }).length, 1);
  assert.deepEqual(filterOrderHistory([order, old], { q: "INV-OLD", payment: "LUNAS" }).map(o => o.id), ["old"]);
  assert.deepEqual(filterOrderHistory([order, old], { from: "2026-10-11", to: "2026-10-11" }).map(o => o.id), ["one"]);
  assert.equal(historyDay(order.createdAt), "2026-10-11");
  assert.equal(filterOrderHistory([{ ...order, status: "DRAFT" }], { status: "DRAFT" }).length, 1);
  assert.equal(historyStatus(order, { DESAIN: "Design", FINISHING: "Finishing" }), "Sedang diproses · 1 Design · 1 Finishing");
  assert.equal(filterOrderHistory([{ ...order, status: "MENUNGGU_PEMBAYARAN", paymentConfirmed: false, paidAmount: 0 }], { status: "DRAFT" }).length, 1);
});

test("search accepts invoice fragments, customer names and normalized WA suffixes without matching middle digits", () => {
  const a = { id: "a", code: "INV-102326-001", customerName: "Asep Printing", phone: "08123456789", total: 55000 };
  const middle = { id: "middle", code: "INV-102326-002", customerName: "Other", phone: "08126789000", total: 155000 };
  for (const q of ["inv-102326-001", "102326-001", "asep", "PRINTING", "6789", "08123456789", "+62 812-345-6789"]) {
    assert.deepEqual(filterOrderHistory([a, middle], { q }).map(o => o.id), ["a"], q);
  }
  assert.equal(filterOrderHistory([{ ...a, phone: "08123450123" }], { q: "0123" }).length, 1);
  assert.equal(filterOrderHistory([{ ...a, items: [{ productName: "Mug" }] }], { q: "mug" }).length, 0);
});

test("total matching is exact and formatted currency searches only Total, never DP or balance", () => {
  const orders = [
    { id: "total", code: "INV-A", customerName: "A", phone: "08123456789", total: 55000, paidAmount: 0 },
    { id: "larger", code: "INV-B", customerName: "B", phone: "08123450000", total: 155000, paidAmount: 55000 },
    { id: "wa", code: "INV-C", customerName: "C", phone: "08123455000", total: 90000, paidAmount: 35000 }
  ];
  for (const q of ["55.000", "Rp 55.000", "rp55000", "55,000"]) assert.deepEqual(filterOrderHistory(orders, { q }).map(o => o.id), ["total"], q);
  assert.deepEqual(filterOrderHistory(orders, { q: "55000" }).map(o => o.id).sort(), ["total", "wa"]);
  assert.equal(filterOrderHistory(orders, { q: "Rp 55.000" }, { money: false }).length, 0);
  assert.deepEqual(filterOrderHistory(orders, { q: "55000" }, { money: false }).map(o => o.id), ["wa"]);
  assert.equal(filterOrderHistory(orders, { q: "Rp 550.00" }).length, 0);
});

test("overlapping WA and Total matches return each invoice once and compose with other filters", () => {
  const order = { id: "same", code: "INV-102326-001", customerName: "Asep", phone: "08123456789", total: 6789, paidAmount: 6789, createdAt: "2026-10-23T00:00:00Z", status: "DESAIN", items: [{ status: "DESAIN" }], payments: [{ method: "QRIS", amount: 6789 }] };
  assert.deepEqual(filterOrderHistory([order], { q: "6789", method: "QRIS", payment: "LUNAS", status: "DESAIN", from: "2026-10-23", to: "2026-10-23" }).map(o => o.id), ["same"]);
  assert.equal(filterOrderHistory([order], { q: "6789", method: "TUNAI" }).length, 0);
});

test("payment methods reflect actual positive payments, including mixed and deposit payments", () => {
  assert.deepEqual(historyPaymentMethods({ payments: [{ type: "PO", method: "TUNAI", amount: 0 }] }), []);
  assert.deepEqual(historyPaymentMethods({ payments: [{ method: "TUNAI", amount: 10 }, { method: "TUNAI", amount: 20 }, { method: "QRIS", amount: 30 }, { method: "TRANSFER", amount: 0 }, { method: "DEPOSIT", type: "DEPOSIT", amount: 40 }, { method: "TRANSFER", type: "REVERSAL", amount: -50 }] }), ["TUNAI", "QRIS", "DEPOSIT"]);
});

test("mixed statuses stay compact while retaining all product stages in the accessible description", () => {
  const order = { status: "DESAIN", confirmed: true, items: [{ status: "DESAIN" }, { status: "FINISHING" }] };
  const summary = historyStatusSummary(order, { DESAIN: "Operator Design", FINISHING: "Finishing" });
  assert.equal(summary.label, "2 status"); assert.equal(summary.tone, "mixed");
  assert.match(summary.title, /1 Operator Design/); assert.match(summary.title, /1 Finishing/);
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
