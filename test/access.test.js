import test from "node:test";
import assert from "node:assert/strict";
import { ROLE_PRESETS, allowedStatusForRole, effectivePermissions, hasPermission, orderVisibleToUser } from "../lib/access.js";

function user(role, overrides = {}) {
  return { id: role.toLowerCase(), name: role, role, permissions: ROLE_PRESETS[role].permissions, ...overrides };
}

test("Staff Gudang dapat melihat laporan quantity tanpa akses nilai uang", () => {
  const warehouse = user("WAREHOUSE");
  assert.equal(hasPermission(warehouse, "reports.view"), true);
  assert.equal(hasPermission(warehouse, "reports.money"), false);
  assert.equal(hasPermission(warehouse, "reports.cost"), false);
  assert.equal(ROLE_PRESETS.WAREHOUSE.reportScope, "today");
});

test("Operator Cetak hanya mendapat Order dan perpindahan status produksi", () => {
  const printer = user("PRINT");
  assert.equal(hasPermission(printer, "projects.orders"), true);
  assert.equal(hasPermission(printer, "projects.waiting"), false);
  assert.equal(hasPermission(printer, "pos.view"), false);
  assert.equal(orderVisibleToUser({ status: "CETAK" }, printer), true);
  assert.equal(orderVisibleToUser({ status: "MENUNGGU_PEMBAYARAN" }, printer), false);
  assert.equal(allowedStatusForRole("PRINT", "CETAK", "FINISHING"), true);
  assert.equal(allowedStatusForRole("PRINT", "DESAIN", "CETAK"), false);
});

test("permission khusus user menggantikan template role", () => {
  const cashier = user("CASHIER", { permissions: ["pos.view"] });
  assert.deepEqual(effectivePermissions(cashier), ["pos.view"]);
  assert.equal(hasPermission(cashier, "pos.payment"), false);
});

test("Owner memiliki seluruh permission yang terdaftar", () => {
  assert.ok(ROLE_PRESETS.OWNER.permissions.length > ROLE_PRESETS.ADMIN.permissions.length);
  assert.equal(hasPermission(user("OWNER"), "users.manage"), true);
  assert.equal(hasPermission(user("OWNER"), "reports.cost"), true);
});
