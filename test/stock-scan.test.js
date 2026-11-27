import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { startStockTestServer, stockTestLogin } from "./helpers/stock-scan-server.js";
import { parseStockBarcode, stockScanAccess } from "../public/stock-scan-rules.js";
import { acceptsScan, deliberateClick, resetScan, reviewScan, scanDraft, selectScanMode, setScanQuantity, stageScannedMaterial, updateScanReview } from "../public/stock-scan-machine.js";
import { stockScanCatalog } from "../lib/stock-scan.js";
import { commitPhysicalStock } from "../lib/physical-stock.js";
import { witaDay } from "../public/order-rules.js";

test("barcode dan draft memilih mode, mengaktifkan bahan unik, dan mengunci scan selama review", () => {
  assert.deepEqual(parseStockBarcode(" CMD:OUT\r"), { type: "command", value: "OUT" });
  assert.deepEqual(parseStockBarcode("CMD:IN"), { type: "command", value: "IN" });
  assert.deepEqual(parseStockBarcode("CMD:REVIEW"), { type: "command", value: "REVIEW" });
  assert.deepEqual(parseStockBarcode("CMD:CANCEL"), { type: "command", value: "CANCEL" });
  assert.deepEqual(parseStockBarcode("MAT:mat-test-110"), { type: "material", value: "mat-test-110" });
  for (const invalid of ["CMD:CONFIRM", "MAT:../id", "QTY:02", "QTY:4", "QTY:2.5", "MAT:"]) assert.equal(parseStockBarcode(invalid), null);
  for (const value of [1, 2, 3, 5, 10]) assert.deepEqual(parseStockBarcode(`QTY:${value}`), { type: "quantity", value });
  const draft = scanDraft();
  const first = { materialId: "mat-test-110", name: "FL 280", rollWidthCm: 110, balance: 10 };
  const second = { materialId: "mat-test-220", name: "FL 280", rollWidthCm: 220, balance: 4 };
  assert.throws(() => stageScannedMaterial(draft, first), /pilih|Pilih/);
  assert.throws(() => setScanQuantity(draft, null, 1), /sebelum memilih jumlah/);
  selectScanMode(draft, "OUT");
  assert.throws(() => reviewScan(draft), /minimal satu/);
  stageScannedMaterial(draft, first);
  assert.throws(() => selectScanMode(draft, "IN"), /Batalkan/);
  setScanQuantity(draft, first.materialId, 5);
  setScanQuantity(draft, first.materialId, 5);
  stageScannedMaterial(draft, second);
  stageScannedMaterial(draft, first);
  assert.equal(draft.activeId, first.materialId);
  assert.equal(draft.items.size, 2);
  assert.equal(draft.items.get(first.materialId).quantity, 5);
  assert.equal(draft.items.get(second.materialId).quantity, 1);
  assert.throws(() => setScanQuantity(draft, second.materialId, 2.5), /bilangan bulat/);
  reviewScan(draft);
  assert.equal(draft.phase, "REVIEW");
  assert.equal(acceptsScan(draft), false);
  setScanQuantity(draft, first.materialId, 2);
  stageScannedMaterial(draft, { materialId: "unknown" });
  assert.equal(draft.items.size, 2);
  assert.equal(draft.items.get(first.materialId).quantity, 5);
  updateScanReview(draft, [{ materialId: first.materialId, current: { ...first, balance: 4 } }]);
  assert.equal(draft.items.get(first.materialId).balance, 4);
  resetScan(draft);
  assert.equal(draft.items.size, 0);
  assert.equal(draft.phase, "IDLE");
  assert.equal(deliberateClick({ isTrusted: false, detail: 1 }), false);
  assert.equal(deliberateClick({ isTrusted: true, detail: 0 }), false);
  assert.equal(deliberateClick({ isTrusted: true, detail: 1 }), true);
});

test("katalog menolak ID ganda dan produksi mengurangi hanya bahan stok Per Satuan", () => {
  const roll = { id: "roll-110", sku: "ROLL-110", stockMethod: "ROLL", rollWidthCm: 110, name: "Roll uji" };
  const rollStock = { sku: roll.sku, materialId: roll.id, productName: roll.name, unit: "roll", stockMethod: "ROLL", rollWidthCm: 110, quantity: 14 };
  const unitStock = { sku: "PAPER", unit: "lbr", stockMethod: "UNIT", quantity: 20 };
  const state = { materials: [roll], inventory: [rollStock, unitStock], stockMovements: [], orders: [] };
  assert.equal(stockScanCatalog(state).length, 1);
  assert.equal(stockScanCatalog({ ...state, inventory: [...state.inventory, { ...rollStock }] }).length, 0);
  assert.equal(stockScanCatalog({ ...state, materials: [roll, { ...roll, deletedAt: "2026-11-27" }] }).length, 0);
  const order = { id: "order", code: "QA-001", status: "CETAK", items: [
    { itemId: "roll", status: "CETAK", materials: [{ sku: roll.sku, materialId: roll.id, units: 2 }] },
    { itemId: "paper", status: "CETAK", materials: [{ sku: unitStock.sku, units: 3 }] }
  ] };
  commitPhysicalStock(state, order);
  assert.equal(rollStock.quantity, 14);
  assert.equal(unitStock.quantity, 17);
  assert.deepEqual(state.stockMovements.map(move => move.type), ["AUTO_USE"]);
});

test("hak akses scanner dan print terpisah dari penyesuaian dan koreksi", () => {
  assert.deepEqual(stockScanAccess({ role: "WAREHOUSE", permissions: ["stock.view", "stock.scan"] }), { scan: true, print: false, correct: false });
  assert.deepEqual(stockScanAccess({ role: "WAREHOUSE", permissions: ["stock.view", "stock.adjust"] }), { scan: false, print: false, correct: false });
  assert.deepEqual(stockScanAccess({ role: "MANAGER", permissions: ["stock.view", "stock.adjust"] }), { scan: true, print: true, correct: true });
  assert.deepEqual(stockScanAccess({ role: "CASHIER", permissions: ["stock.scan", "stock.scan.print"] }), { scan: false, print: false, correct: false });
});

const scanApi = "/api/stock/scan";

test("API scan terautentikasi, validasi batch atomik, retry, konflik antar sesi, dan koreksi dua arah", async t => {
  const base = await startStockTestServer(t);
  const owner = await stockTestLogin(base);
  const anotherOwnerSession = await stockTestLogin(base);
  const fixture = (name, sku, width, quantity) => ({ name, sku, category: "Roll Outdoor", unit: "m²", stock: quantity, stockMethod: "ROLL", rollWidthCm: width });
  const first = await owner.ok("/api/materials", "POST", fixture("FL Scan 110", "SCAN-QA-110", 110, 10));
  const second = await owner.ok("/api/materials", "POST", fixture("FL Scan 220", "SCAN-QA-220", 220, 3));
  const unit = await owner.ok("/api/materials", "POST", { name: "Kertas Scan Uji", sku: "SCAN-QA-UNIT", unit: "lbr", stock: 10, stockMethod: "UNIT" });
  const staffUser = await owner.ok("/api/users", "POST", { name: "Staf Gudang Uji", username: "stock-test", pin: "7654", role: "WAREHOUSE", permissions: ["stock.view", "stock.scan"] });
  await owner.ok("/api/users", "POST", { name: "Print Uji", username: "label-test", pin: "7654", role: "WAREHOUSE", permissions: ["stock.view", "stock.scan.print"] });
  await owner.ok("/api/users", "POST", { name: "Gudang Uji", username: "default-stock-test", pin: "7654", role: "WAREHOUSE" });
  const staff = await stockTestLogin(base, "stock-test", "7654");
  const print = await stockTestLogin(base, "label-test", "7654");
  const other = await stockTestLogin(base, "default-stock-test", "7654");
  const material = async (id, account = staff) => (await account.ok(`${scanApi}/catalog/${id}`)).material;
  const payload = (direction, items, note) => ({ requestId: randomUUID(), direction, items: items.map(([row, quantity]) => ({ materialId: row.materialId, version: row.version, quantity })), note });
  const apply = (body, account = staff) => account.ok(`${scanApi}/commit`, "POST", body);
  const checked = async (status, path, method, body, account = staff) => {
    const result = await account.request(path, method, body);
    assert.equal(result.status, status, JSON.stringify(result));
    return result.body;
  };

  assert.equal((await fetch(`${base}${scanApi}/catalog`)).status, 401);
  const { materials } = await staff.ok(scanApi + "/catalog");
  assert.deepEqual(materials.filter(row => row.sku.startsWith("SCAN-QA-")).map(row => row.rollWidthCm), [110, 220]);
  assert.ok(materials.every(row => !("cost" in row) && !("supplier" in row)));
  assert.equal((await print.ok(scanApi + "/catalog")).materials.length, materials.length);
  await checked(403, scanApi + "/history", "GET", undefined, print);
  await checked(403, scanApi + "/catalog", "GET", undefined, other);
  await checked(403, "/api/inventory/" + first.sku, "PATCH", { change: 1, reason: "Uji" });
  await checked(409, scanApi + "/catalog/" + unit.id);
  await checked(409, scanApi + "/catalog/mat-flexi-280");
  await checked(404, scanApi + "/catalog/material-tidak-ada");

  const out = payload("OUT", [[await material(first.id), 1]], "Gudang uji");
  assert.equal((await staff.request(scanApi + "/commit", "POST", out, { csrf: false })).status, 403);
  await checked(403, scanApi + "/commit", "POST", out, print);
  const { movements: [removed], groupId } = await apply({ ...out, actorId: "palsu", actor: "palsu", balance: 9999 });
  assert.equal(removed.previousBalance, 10);
  assert.equal(removed.balance, 9);
  assert.equal(removed.actor, staffUser.name);
  assert.equal(removed.reason, "Buka Roll Baru");
  assert.equal(removed.note, "Gudang uji");
  assert.equal(removed.source, "BARCODE");
  const inPayload = payload("IN", [[await material(first.id), 5]]);
  const { movements: [received] } = await apply(inPayload);
  assert.equal(received.balance, 14);
  assert.equal(received.reason, "Penerimaan Bahan");
  assert.equal((await apply(out)).groupId, groupId);
  assert.equal((await apply(out)).replayed, true);
  assert.equal((await material(first.id)).balance, 14);
  await checked(409, scanApi + "/commit", "POST", { ...out, note: "ubah" });
  await checked(409, scanApi + "/commit", "POST", out, owner);
  await checked(400, scanApi + "/commit", "POST", payload("OUT", [[await material(first.id), 1.5]]));
  await checked(413, scanApi + "/commit", "POST", { ...out, note: "a".repeat(30_000) });

  const snapshot1 = await material(first.id), snapshot2 = await material(second.id);
  await checked(400, scanApi + "/commit", "POST", payload("IN", [[snapshot1, 1], [snapshot1, 2]]));
  assert.equal((await checked(409, scanApi + "/commit", "POST", payload("OUT", [[snapshot1, 1], [snapshot2, 6]]))).code, "SCAN_REVIEW_CHANGED");
  assert.equal((await material(first.id)).balance, 14);
  assert.equal((await material(second.id)).balance, 3);
  const concurrent = await Promise.all([owner, anotherOwnerSession].map(account => account.request(scanApi + "/commit", "POST", payload("OUT", [[snapshot1, 2], [snapshot2, 1]]))));
  assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 409]);
  const concurrentReceipt = concurrent.find(result => result.status === 200).body;
  assert.equal(concurrentReceipt.movements.length, 2);
  assert.equal(new Set(concurrentReceipt.movements.map(row => row.groupId)).size, 1);
  assert.equal((await material(first.id)).balance, 12);
  assert.equal((await material(second.id)).balance, 2);
  assert.equal(concurrent.find(result => result.status === 409).body.materials[0].current.balance > 0, true);

  const beforeRename = await material(second.id);
  await owner.ok("/api/materials/" + second.id, "PUT", { ...second, sku: "SCAN-QA-RENAME", name: "FL Scan Lebar 220" });
  const reusedSku = await owner.ok("/api/materials", "POST", fixture("Bahan SKU terpakai ulang", second.sku, 250, 0));
  assert.notEqual(reusedSku.id, second.id);
  const renamed = await material(second.id);
  assert.equal(renamed.sku, "SCAN-QA-RENAME");
  assert.equal(renamed.rollWidthCm, 220);
  await checked(409, scanApi + "/commit", "POST", payload("OUT", [[beforeRename, 1]]));
  const committed = await apply(payload("IN", [[renamed, 2]]));
  assert.equal(committed.movements[0].productName, "FL Scan Lebar 220");
  const beforeArchive = await material(reusedSku.id);
  await owner.ok("/api/materials/" + reusedSku.id, "DELETE");
  await checked(409, scanApi + "/catalog/" + reusedSku.id);
  const archiveConflict = await checked(409, scanApi + "/commit", "POST", payload("IN", [[beforeArchive, 2]]));
  assert.equal(archiveConflict.materials[0].current, null);
  const converting = await owner.ok("/api/materials", "POST", fixture("Bahan uji ubah metode", "SCAN-QA-CONVERT", 130, 0));
  const beforeConversion = await material(converting.id);
  const physical = (await owner.ok("/api/stock-balances")).inventory.find(stock => stock.materialId === converting.id);
  await owner.ok("/api/materials/" + converting.id, "PUT", { ...converting, stockMethod: "UNIT", unit: "m²",
    expectedQuantity: physical.quantity, expectedUnit: physical.unit, expectedMethod: physical.stockMethod,
    expectedUpdatedAt: physical.updatedAt, confirmStockCount: true, stockOpeningBalance: 0, stockCountReason: "Pencatatan m²"
  });
  const methodConflict = await checked(409, scanApi + "/commit", "POST", payload("IN", [[beforeConversion, 2]]));
  assert.match(methodConflict.error, /Per Roll/);
  const correction = move => `${scanApi}/movements/${move.id}/correction`;
  await checked(403, correction(removed));
  const correctPayload = async (original, overrides) => ({ requestId: randomUUID(), quantity: 1, version: (await material(original.materialId)).version, reason: "Nomor roll salah", physicalConfirmed: true, ...overrides });
  await checked(400, correction(removed), "POST", await correctPayload(removed, { physicalConfirmed: false }), owner);
  await checked(400, correction(removed), "POST", await correctPayload(removed, { quantity: 2 }), owner);
  const correctOut = await correctPayload(removed);
  const { movements: [restored] } = await owner.ok(correction(removed), "POST", correctOut);
  assert.equal(restored.change, 1);
  assert.equal(restored.reversalOf, removed.id);
  assert.equal(restored.source, "CORRECTION");
  assert.equal((await owner.ok(correction(removed), "POST", correctOut)).replayed, true);
  await checked(409, correction(removed), "POST", await correctPayload(removed), owner);
  const { movements: [deducted] } = await owner.ok(correction(received), "POST", await correctPayload(received, { quantity: 2 }));
  assert.equal(deducted.change, -2);
  assert.equal(deducted.reversalOf, received.id);
  assert.equal((await owner.ok(correction(removed))).correction.id, restored.id);
  assert.equal((await owner.ok("/api/stock-balances")).inventory.find(row => row.materialId === first.id).quantity, 11);

  const history = await staff.ok(scanApi + "/history?limit=2");
  assert.equal(history.hasMore, true);
  assert.deepEqual(history.movements.map(row => row.id), [committed.movements[0].id, received.id]);
  assert.deepEqual((await staff.ok(scanApi + "/history?offset=2&limit=2")).movements.map(row => row.id), [removed.id]);
  const recent = (await owner.ok("/api/stock-movements?date=" + witaDay() + "&limit=25")).movements;
  assert.ok(recent.some(row => row.id === removed.id && row.actorId === staffUser.id));
  assert.ok(recent.some(row => row.id === restored.id && row.actorId === owner.user.id));
  assert.ok(recent.every(row => !("requestFingerprint" in row)));
  const audit = (await owner.ok("/api/bootstrap?view=master")).auditLogs;
  assert.ok(audit.some(row => row.metadata.groupId === groupId && row.userId === staffUser.id));
  await staff.ok("/api/logout", "POST", {});
  await checked(401, scanApi + "/history");
});
