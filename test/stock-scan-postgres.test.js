import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { databaseConfig } from "../lib/database-config.js";
import { requestContext } from "../lib/request-context.js";
import { Store } from "../lib/store.js";
import { commitStockScan, correctStockScan, parseScanCommit, parseScanCorrection, scanCorrectionDetails, stockScanCatalog, stockScanStaffCatalog } from "../lib/stock-scan.js";

const databaseUrl = process.env.TEST_SECURITY_DATABASE_URL;

test("PostgreSQL mengunci batch scan, stok manual, audit, dan koreksi pada baris yang sama", { skip: !databaseUrl }, async () => {
  const config = databaseConfig(databaseUrl);
  const root = new pg.Pool(config);
  const schema = "scan_" + randomBytes(8).toString("hex");
  const one = new Store();
  const two = new Store();
  try {
    await root.query(`CREATE SCHEMA ${schema}`);
    const options = { ...config, options: "-csearch_path=" + schema };
    one.pool = new pg.Pool(options);
    two.pool = new pg.Pool(options);
    await one.init();
    const actor = { id: "operator-scan", name: "Operator Uji", active: true, sessionVersion: 1 };
    const employee = { id: "emp-" + randomUUID(), name: "Karyawan Uji", code: "K042", active: true, basicSalary: 1000000 };
    const id = "roll-concurrent";
    await one.mutate(state => {
      state.users.push(actor);
      state.employees.push(employee);
      state.orders.push({ id: "outside-stock-projection", total: 1000, items: [] });
      const roll = { id, sku: "HARN-110", name: "Roll Parallel", unit: "m²", stock: 10, stockMethod: "ROLL", stockUnit: "roll", stockNeedsCount: false, rollWidthCm: 110 };
      state.materials.push(roll);
      state.inventory.push({ sku: roll.sku, materialId: id, productName: roll.name, unit: "roll", stockMethod: "ROLL", stockUnit: "roll", rollWidthCm: 110, quantity: 10 });
    });
    const employees = await two.readStockScanStaff();
    const staffBarcode = stockScanStaffCatalog(employees).find(row => row.code === employee.code).barcode;
    assert.ok(employees.every(row => !("basicSalary" in row)));
    const row = async () => stockScanCatalog(await two.readStockScanCatalog()).find(material => material.materialId === id);
    const audit = (state, user, action, _reason, metadata) => state.auditLogs.unshift({ userId: user.id, action, metadata });
    const make = async () => parseScanCommit({ requestId: randomUUID(), direction: "OUT", staffBarcode, items: [{ materialId: id, quantity: 2, version: (await row()).version }] });
    const payload = await make();
    const run = (store, data) => requestContext.run({ userId: actor.id, version: 1 }, () => store.mutate(
      state => commitStockScan(state, data, actor, new Date().toISOString(), audit), { stockScan: true }
    ));
    const parallel = await Promise.all([run(one, payload), run(two, payload)]);
    assert.equal(parallel.filter(result => !result.replayed).length, 1);
    assert.equal(parallel[0].groupId, parallel[1].groupId);
    assert.equal((await row()).balance, 8);
    const original = parallel[0].movements[0];
    assert.equal(original.staffId, employee.id);
    assert.equal(original.staffName, employee.name);
    assert.equal((await one.readStockScanHistory(actor.id, 0, 10)).length, 1);
    assert.deepEqual(await one.readStockScanHistory("someone-else", 0, 10), []);
    const [p1, p2] = await Promise.all([make(), make()]);
    const results = await Promise.allSettled([run(one, p1), run(two, p2)]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(results.find(result => result.status === "rejected").reason.code, "SCAN_REVIEW_CHANGED");
    assert.equal((await row()).balance, 6);

    const manualRace = await make();
    await one.mutate(state => {
      state.inventory.find(stock => stock.materialId === id).quantity = 9;
      state.materials.find(material => material.id === id).stock = 9;
    });
    await assert.rejects(run(two, manualRace), error => error.code === "SCAN_REVIEW_CHANGED");
    assert.equal((await row()).balance, 9);
    const rollback = await make();
    await assert.rejects(one.mutate(state => {
      commitStockScan(state, rollback, actor, new Date().toISOString(), audit);
      throw new Error("Force test rollback");
    }, { stockScan: true }), /test rollback/);
    assert.equal((await row()).balance, 9);
    assert.equal((await one.readStockScanHistory(actor.id, 0, 10)).length, 2);

    const details = scanCorrectionDetails(await one.readStockScanCorrection(original.id), original.id);
    assert.equal(details.current.balance, 9);
    const adjustment = parseScanCorrection({ requestId: randomUUID(), quantity: 1, version: details.current.version, reason: "Pemeriksaan fisik uji", physicalConfirmed: true }, original.id);
    const result = await two.mutate(state => correctStockScan(state, adjustment, actor, new Date().toISOString(), audit), { stockScan: true });
    assert.equal(result.movements[0].balance, 10);
    const updatedDetails = scanCorrectionDetails(await one.readStockScanCorrection(original.id), original.id);
    assert.equal(updatedDetails.correction.id, result.movements[0].id);
    assert.equal(updatedDetails.original.id, original.id);
    const complete = await one.read();
    assert.equal(complete.orders[0].id, "outside-stock-projection");
    assert.equal(complete.employees.find(row => row.id === employee.id).basicSalary, employee.basicSalary);
    assert.equal(complete.auditLogs.length, 3);
    assert.equal(complete.stockMovements.length, 3);

    await one.mutate(state => { state.employees.find(row => row.id === employee.id).active = false; });
    await assert.rejects(run(two, await make()), error => error.code === "SCAN_STAFF_INVALID");
    assert.equal((await run(two, payload)).replayed, true);
    await one.mutate(state => { state.users.find(user => user.id === actor.id).sessionVersion = 2; });
    await assert.rejects(run(two, await make()), /Akses akun berubah/);
    assert.equal((await row()).balance, 10);
  } finally {
    await Promise.all([one.pool?.end(), two.pool?.end()]);
    await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await root.end();
  }
});
