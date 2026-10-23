import test from "node:test";
import assert from "node:assert/strict";
import { invoiceCode, compactInvoiceCode, migrateInvoiceNumbers } from "../lib/invoice-numbers.js";
import { historySearchMatch } from "../public/order-history.js";
import { Store } from "../lib/store.js";

test("invoice dates follow WITA and sequence digits never truncate", () => {
  assert.equal(invoiceCode(1, "2026-10-22T16:00:00Z"), "INV-102326-001");
  assert.equal(invoiceCode(9, "2026-12-31T16:00:00Z"), "INV-010127-009");
  assert.equal(invoiceCode(1000, "2026-10-23T00:00:00Z"), "INV-102326-1000");
  assert.equal(compactInvoiceCode("MP-20261023-0001"), "INV-102326-001");
  assert.equal(compactInvoiceCode("CUSTOM-01"), "CUSTOM-01");
});

test("invoice migration preserves IDs, amounts, stock, audit text, aliases and request fingerprints", async () => {
  const code = "MP-20261023-0001", expected = "INV-102326-001";
  const state = {
    orders: [{ id: "o", code, customerName: "Customer", total: 125000, paidAmount: 1000, payments: [{ amount: 1000 }], timeline: [{ orderCode: code, message: "Nota " + code }] }],
    activities: [{ orderCode: code }], cashReceipts: [{ orderId: "o", orderCode: code, amount: 1000 }],
    depositLedger: [{ orderCode: code, amount: 100 }], stockMovements: [{ orderCode: code, change: -2 }],
    auditLogs: [{ message: code, metadata: { orderCode: code } }],
    customerOperations: [{ fingerprint: JSON.stringify([code]), result: { receipt: { orderCode: code } } }],
    inventory: [{ quantity: 8 }], nextOrderNumber: 2
  };
  const before = structuredClone(state);
  migrateInvoiceNumbers(state);
  assert.equal(state.orders[0].code, expected);
  assert.deepEqual(state.orders[0].invoiceAliases, [code]);
  for (const key of ["activities", "cashReceipts", "depositLedger", "stockMovements"]) assert.equal(state[key][0].orderCode, expected);
  assert.equal(state.orders[0].timeline[0].orderCode, expected);
  assert.equal(state.auditLogs[0].metadata.orderCode, expected);
  assert.equal(state.customerOperations[0].result.receipt.orderCode, expected);
  assert.equal(state.customerOperations[0].fingerprint, before.customerOperations[0].fingerprint);
  assert.equal(state.auditLogs[0].message, code);
  assert.equal(state.orders[0].timeline[0].message, "Nota " + code);
  assert.equal(state.orders[0].id, "o");
  assert.equal(state.orders[0].total, 125000);
  assert.equal(state.orders[0].paidAmount, 1000);
  assert.deepEqual(state.orders[0].payments, before.orders[0].payments);
  assert.deepEqual(state.inventory, before.inventory);
  assert.equal(state.nextOrderNumber, 2);
  assert.ok(historySearchMatch(state.orders[0], code));
  assert.ok(historySearchMatch(state.orders[0], expected));
  const migrated = structuredClone(state);
  migrateInvoiceNumbers(state);
  assert.deepEqual(state, migrated);
  state.orders.push({ id: "late", code: "MP-20261023-0002" });
  migrateInvoiceNumbers(state);
  assert.equal(state.orders[1].code, "INV-102326-002");
  assert.deepEqual(state.orders[0].invoiceAliases, [code]);
  // The Store applies migration before readers and mutators see old invoices.
  const store = new Store(); store.memory.orders = before.orders;
  assert.equal((await store.read()).orders[0].code, expected);
  await store.mutate(() => {});
  assert.equal(store.memory.orders[0].code, expected);
  const original = { orders: [{ code }, { code: expected }] }, duplicate = structuredClone(original);
  assert.throws(() => migrateInvoiceNumbers(duplicate), /bertabrakan/);
  assert.deepEqual(duplicate, original);
});
