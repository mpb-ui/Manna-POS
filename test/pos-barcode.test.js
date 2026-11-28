import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { databaseConfig } from "../lib/database-config.js";
import { barcodeBackupState } from "../lib/pos-barcode-store.js";
import { Store } from "../lib/store.js";
import { barcodeBuffer } from "../public/pos-barcode-scan.js";
import { barcodeTargetKey, barcodeText, retailBarcodeFormat } from "../public/pos-barcode-rules.js";
import { startStockTestServer, stockTestLogin } from "./helpers/stock-scan-server.js";

const barcodeApi = "/api/pos-barcodes";
const single = barcodeTargetKey({});
const ean = "0012345678905";
const databaseUrl = process.env.TEST_SECURITY_DATABASE_URL;
const target = (product, key = single) => ({ productId: product.id, targetKey: key });

test("Barcode POS mempertahankan leading zero dan frame HID yang dipindai berulang", () => {
  assert.equal(barcodeText(ean), ean);
  assert.equal(barcodeText(12345), "");
  assert.equal(barcodeText("123\n45"), "");
  assert.equal(retailBarcodeFormat(ean), "EAN13");
  assert.equal(retailBarcodeFormat("01234565"), "EAN8");
  assert.equal(retailBarcodeFormat("012345678905"), "UPC");
  assert.equal(retailBarcodeFormat("MPP12345678"), "CODE128");
  const buffer = barcodeBuffer();
  let time = 0;
  for (let scan = 0; scan < 3; scan++) {
    for (const key of ean) buffer.push(key, time += 4, "global");
    assert.equal(buffer.take(time += 10, "global"), ean);
    assert.equal(buffer.take(time += 2, "global"), "");
  }
  buffer.push("Z", time += 120, "global");
  assert.equal(buffer.take(time += 10, "search"), "");
  buffer.push("Z", time += 10, "global");
  assert.equal(buffer.take(time += 101, "global"), "");
});

async function prepareAcrylicAndFrame(owner, cashier, catalog) {
  const { ok, request } = owner;
  const acrylic = catalog.products.find(product => product.id === "direct-akrilik-display-7x4");
  const prepare = barcodeApi + "/prepare-product";
  const acrylicCatalog = `${barcodeApi}/catalog?productId=${acrylic.id}`;
  assert.equal((await ok(acrylicCatalog)).rows[0].needsMerchandise, true);
  const inventory = async () => (await ok("/api/bootstrap?view=stock")).inventory;
  assert.equal((await inventory()).some(row => row.productId === acrylic.id), false);
  assert.equal((await cashier.request(prepare, "POST", { productId: acrylic.id })).status, 403);
  assert.equal((await request(barcodeApi + "/generate", "POST", target(acrylic))).body.code, "BARCODE_TYPE");
  const prepared = await ok(prepare, "POST", { productId: acrylic.id });
  assert.equal(prepared.productKind, "MERCHANDISE");
  assert.equal(prepared.retailStockSku, acrylic.sku);
  assert.equal((await ok(acrylicCatalog)).rows[0].needsMerchandise, false);

  await ok("/api/categories/products", "POST", { name: "Frame Foto" });
  const frame = await ok("/api/products", "POST", {
    name: "Frame Foto Siap Jual Uji", sku: "QA-FOTO-FRAME", category: "Frame Foto",
    productKind: "MERCHANDISE", saleUnit: "pcs", price: 45000
  });
  const frameRows = (await ok(`${barcodeApi}/catalog?productId=${frame.id}`)).rows;
  assert.equal(frameRows[0].category, "Frame Foto");
  assert.equal(frameRows[0].needsMerchandise, false);
  const acrylicCode = (await ok(barcodeApi + "/generate", "POST", target(acrylic))).barcode.code;
  const frameCode = "FRAME-READY-A4";
  await ok(barcodeApi + "/register", "POST", { ...target(frame), code: frameCode });

  for (const item of [acrylic, frame]) {
    const stockRow = (await inventory()).find(row => row.productId === item.id);
    assert.equal(stockRow.stockMethod, "UNIT");
    assert.equal(stockRow.sku, item.sku);
    await ok("/api/inventory/" + item.sku, "PATCH", { change: 2, reason: "Saldo uji barcode" });
  }
  assert.deepEqual(await ok(prepare, "POST", { productId: acrylic.id }), prepared);
  const selections = await Promise.all([acrylicCode, frameCode].map(code =>
    cashier.ok(`${barcodeApi}/lookup?code=${encodeURIComponent(code)}`)));
  assert.deepEqual(selections.map(item => item.productId), [acrylic.id, frame.id]);
  const items = selections.map(({ productId, selection }) => ({ productId, ...selection, quantity: 1 }));
  const order = await cashier.ok("/api/orders", "POST", {
    customerName: "Uji Barcode Akrilik dan Frame", phone: "081234000012", items
  });
  assert.deepEqual(order.items.map(item => item.stockTiming), ["SALE", "SALE"]);
  assert.deepEqual(order.items.map(item => item.needsProduction), [false, false]);
  await cashier.ok(`/api/orders/${order.id}/payments`, "POST", {
    method: "TUNAI", amount: order.total, requestId: "barcode-acrylic-frame"
  });
  const afterPayment = await inventory();
  for (const item of [acrylic, frame]) {
    assert.equal(afterPayment.find(row => row.productId === item.id).quantity, 1);
  }
}

async function registryChecks(t, base) {
  const owner = await stockTestLogin(base);
  const { ok, request } = owner;
  const boot = await ok("/api/bootstrap?view=pos");
  assert.equal(boot.posBarcodeEnabled, false);
  assert.deepEqual(boot.posBarcodeCodes, []);
  const sku = "QA-CODE-PEN";
  const pen = await ok("/api/products", "POST", {
    name: "Pulpen Barcode Uji", sku, category: "ATK", retailAtK: true, saleUnit: "pcs", price: 10000,
    wholesaleEnabled: true, priceTiers: [{ min: 3, max: null, price: 8000 }],
    discount: { enabled: true, type: "percent", value: 10 }
  });
  const frame = await ok("/api/products", "POST", {
    name: "Akrilik Barcode Uji", sku: "QA-CODE-FRAME", category: "Akrilik", productKind: "MERCHANDISE",
    productEditorVersion: 1, saleUnit: "pcs", price: 35000, hasMaterialVariants: true, variantType: "Varian Ukuran",
    subVariants: [{ id: "one", label: "1 Sisi" }, { id: "two", label: "2 Sisi" }],
    materialVariants: [{ id: "a4", label: "A4", price: 35000, materialSources: [], combinations: [
      { subVariantId: "one", price: 35000, active: true, materialSources: [] },
      { subVariantId: "two", price: 40000, active: true, materialSources: [] }
    ] }]
  });
  const a4 = { materialVariantId: "a4", subVariantId: "one", sizeVariantId: "" };
  const a4Back = { ...a4, subVariantId: "two" };
  const write = (action, data, method = "POST") => ok(barcodeApi + action, method, data);
  const register = (product, code, key = single) => write("/register", { ...target(product, key), code });
  const resolve = code => `${barcodeApi}/lookup?code=${encodeURIComponent(code)}`;
  await register(pen, ean);
  const first = await Promise.all(Array.from({ length: 5 }, () => write("/generate", target(pen))));
  const internal = first[0].barcode.code;
  assert.match(internal, /^MPP\d{8}$/);
  assert.ok(first.every(result => result.barcode.code === internal));
  const variants = await ok(`${barcodeApi}/catalog?productId=${frame.id}`);
  assert.deepEqual(variants.rows.map(row => row.variant), ["A4 · 1 Sisi", "A4 · 2 Sisi"]);
  const competing = await Promise.all([a4, a4Back].map(selection => request(barcodeApi + "/register", "POST", {
    ...target(frame, barcodeTargetKey(selection)), code: "RACE-ALIAS"
  })));
  assert.deepEqual(competing.map(result => result.status).sort(), [200, 409]);
  const a4Code = "036000291452";
  await register(frame, a4Code, barcodeTargetKey(a4));
  assert.equal((await request(barcodeApi + "/register", "POST", { ...target(frame, barcodeTargetKey(a4Back)), code: ean })).body.code, "BARCODE_DUPLICATE");
  assert.equal((await request(barcodeApi + "/register", "POST", { ...target(frame, barcodeTargetKey(a4Back)), code: ean.slice(1) })).body.code, "BARCODE_DUPLICATE");
  for (const code of ["MAT:qa-roll", "CMD:IN", "QTY:3", "STF:Eemp-maria", "OWN:Eowner-lama", internal]) {
    assert.equal((await request(barcodeApi + "/register", "POST", { ...target(pen), code })).body.code, "BARCODE_RESERVED");
  }
  await register(pen, "OLD-ALIAS");
  await write("/register", { ...target(pen), previousCode: "OLD-ALIAS", code: "PEN-BLACK" });
  await write("/register", { ...target(pen), code: "PEN-BLACK" }, "DELETE");
  assert.equal((await request(resolve(ean))).body.code, "BARCODE_DISABLED");
  const roles = [
    ["cash", "CASHIER", undefined],
    ["catalog", "CASHIER", ["master.view", "master.products"]],
    ["supervisor", "ADMIN", undefined],
    ["warehouse", "WAREHOUSE", undefined]
  ];
  for (const [username, role, permissions] of roles) {
    await ok("/api/users", "POST", { name: username, username, role, pin: "1234", ...(permissions ? { permissions } : {}) });
  }
  const cashier = await stockTestLogin(base, "cash", "1234");
  const catalog = await stockTestLogin(base, "catalog", "1234");
  const admin = await stockTestLogin(base, "supervisor", "1234");
  const warehouse = await stockTestLogin(base, "warehouse", "1234");
  assert.equal((await cashier.request(barcodeApi + "/catalog")).status, 403);
  assert.equal((await warehouse.request(resolve(ean))).status, 403);
  assert.equal((await catalog.request(barcodeApi + "/settings", "PUT", { enabled: true })).status, 403);
  assert.equal((await request(barcodeApi + "/settings", "PUT", { enabled: true }, { csrf: false })).status, 403);
  await admin.ok(barcodeApi + "/settings", "PUT", { enabled: true });
  await prepareAcrylicAndFrame(owner, cashier, boot);
  assert.deepEqual(await cashier.ok(resolve(a4Code)), { productId: frame.id, selection: a4 });
  assert.equal((await cashier.ok(resolve(ean))).productId, pen.id);
  assert.equal((await cashier.ok(resolve(internal))).productId, pen.id);
  assert.equal((await cashier.request(resolve("QTY:3"))).body.code, "BARCODE_INVENTORY");
  assert.equal((await cashier.request(resolve("STF:Eemp-maria"))).body.code, "BARCODE_INVENTORY");
  assert.equal((await cashier.request(resolve("OWN:Eowner-lama"))).body.code, "BARCODE_INVENTORY");
  assert.equal((await cashier.ok(resolve(ean.slice(1)))).productId, pen.id);
  for (const code of [ean.slice(2), "OLD-ALIAS", "PEN-BLACK", "UNKNOWN"]) {
    assert.equal((await cashier.request(resolve(code))).body.code, "BARCODE_UNKNOWN");
  }
  const disabled = structuredClone(frame);
  disabled.materialVariants[0].combinations[0].active = false;
  await ok("/api/products/" + frame.id, "PUT", disabled);
  assert.equal((await cashier.request(resolve(a4Code))).body.code, "BARCODE_VARIANT");
  await ok("/api/products/" + frame.id, "PUT", { ...frame, active: false });
  assert.equal((await cashier.request(resolve(a4Code))).body.code, "BARCODE_INACTIVE");

  await ok(`/api/inventory/${sku}`, "PATCH", { change: 4, reason: "Uji Barcode POS" });
  const stock = async () => (await ok("/api/bootstrap?view=stock")).inventory.find(row => row.productId === pen.id).quantity;
  const production = await ok("/api/products", "POST", {
    name: "Cetak QA tanpa Barcode", sku: "QA-NO-CODE", category: "Akrilik", productKind: "PRODUCTION",
    saleUnit: "pcs", price: 50000, machineIds: ["mach-digital"],
    materialSources: [{ materialId: "mat-art260", quantity: 1 }]
  });
  assert.equal((await request(barcodeApi + "/generate", "POST", target(production))).body.code, "BARCODE_TYPE");
  assert.equal((await request(barcodeApi + "/prepare-product", "POST", { productId: production.id })).body.code, "BARCODE_TYPE");
  const items = [{ productId: pen.id, quantity: 3 }, { productId: production.id, quantity: 1 }];
  const quote = (rows, client = cashier) => client.request("/api/orders/check", "POST", { items: rows, includeItems: true, validateRetailStock: true });
  assert.equal((await quote(items)).body.total, 71600);
  assert.equal((await quote([{ ...items[0], quantity: 2 }])).body.total, 18000);
  assert.equal((await quote([items[0], { ...items[0], quantity: 2 }])).status, 409);
  assert.equal(await stock(), 4);
  const create = client => client.ok("/api/orders", "POST", { customerName: "Uji Barcode POS", phone: "081234000010", items });
  const clients = [owner, cashier];
  const orders = await Promise.all(clients.map(create));
  const payments = order => `/api/orders/${order.id}/payments`;
  const dp = { method: "TUNAI", amount: 5000, requestId: "barcode-dp" };
  await write("/settings", { enabled: false }, "PUT");
  const attempts = await Promise.all(clients.map((client, index) => client.request(payments(orders[index]), "POST", {
    ...dp, requestId: dp.requestId + index
  })));
  assert.deepEqual(attempts.map(attempt => attempt.status).sort(), [200, 409]);
  assert.equal(attempts.find(attempt => attempt.status === 409).body.code, "RETAIL_STOCK_SHORTAGE");
  const winner = attempts.findIndex(attempt => attempt.status === 200);
  const firstOrder = orders[winner];
  await clients[winner].ok(payments(firstOrder), "POST", { ...dp, requestId: dp.requestId + winner });
  assert.equal(await stock(), 1);
  const paid = await ok(payments(firstOrder), "POST", { ...dp, amount: firstOrder.total - 5000, requestId: "barcode-lunas" });
  assert.deepEqual(paid.items.map(row => row.stockTiming), ["SALE", "PRODUCTION"]);
  assert.equal(paid.paidAmount, firstOrder.total);
  assert.equal(await stock(), 1);
  const productionPath = `/api/orders/${paid.id}/items/${paid.items[1].itemId}`;
  await ok(productionPath + "/design-pic", "PATCH", { designPic: "Gema" });
  for (const status of ["CETAK", "FINISHING", "SELESAI"]) {
    await ok(productionPath + "/status", "PATCH", { status });
  }
  await ok(`/api/orders/${paid.id}/status`, "PATCH", { status: "DIAMBIL" });
  const exchange = {
    requestId: "barcode-returns", reason: "DEFECT", note: "Barang rusak", defectReceived: true,
    replacementDelivered: true, lines: [{ itemId: paid.items[0].itemId, quantity: 1 }]
  };
  await ok(`/api/orders/${paid.id}/returns`, "POST", exchange);
  await ok(`/api/orders/${paid.id}/returns`, "POST", exchange);
  assert.equal(await stock(), 0);
  await write("/settings", { enabled: true }, "PUT");

  const edited = await ok("/api/products/" + pen.id, "PUT", { ...pen, sku: sku + "-BARU", name: pen.name + " Baru", price: 12000 });
  assert.equal(edited.id, pen.id);
  assert.equal((await cashier.ok(resolve(internal))).productId, pen.id);
  const reused = await ok("/api/products", "POST", { ...pen, sku, name: "SKU Lama Dipakai Kembali" });
  assert.notEqual(reused.id, pen.id);
  assert.equal((await cashier.ok(resolve(internal))).productId, pen.id);
  await write("/settings", { enabled: false }, "PUT");
  assert.equal((await cashier.request(resolve(ean))).body.code, "BARCODE_DISABLED");
  assert.equal((await ok(`${barcodeApi}/catalog?productId=${pen.id}`)).rows[0].barcodes.length, 2);
  return { owner, resolve, pen, internal };
}

test("Barcode POS API memvalidasi role, varian, harga, saldo, pembayaran dan retur", async t => {
  await registryChecks(t, await startStockTestServer(t));
});

test("PostgreSQL mempertahankan barcode, toggle, dan backup serta menolak duplikat langsung di database", {
  skip: !databaseUrl, timeout: 60_000
}, async t => {
  const pool = new pg.Pool(databaseConfig(databaseUrl));
  const suffix = randomBytes(8).toString("hex");
  const name = "barcode_" + suffix;
  const restore = name + "_restored";
  const scopedUrl = schema => {
    const url = new URL(databaseUrl);
    url.searchParams.set("options", "-csearch_path=" + schema);
    return url.toString();
  };
  const source = new Store(), restored = new Store();
  t.after(async () => {
    await Promise.all([source.pool?.end(), restored.pool?.end()]);
    await pool.query(`DROP SCHEMA IF EXISTS ${name}, ${restore} CASCADE`);
    await pool.end();
  });
  await pool.query(`CREATE SCHEMA ${name}`);
  await pool.query(`CREATE SCHEMA ${restore}`);
  source.pool = new pg.Pool(databaseConfig(scopedUrl(name)));
  const base = await startStockTestServer(t, { databaseUrl: scopedUrl(name) });
  const { owner, resolve, pen, internal } = await registryChecks(t, base);
  await owner.ok(barcodeApi + "/settings", "PUT", { enabled: true });
  const insert = "INSERT INTO pos_product_barcodes (code, product_id, target_key, kind) VALUES ($1, $2, $3, $4)";
  await assert.rejects(source.pool.query(insert, [ean, "other-product", single, "FACTORY"]), { code: "23505" });
  const anotherInternal = internal === "MPP00000000" ? "MPP00000001" : "MPP00000000";
  await assert.rejects(source.pool.query(insert, [anotherInternal, pen.id, single, "INTERNAL"]), { code: "23505" });
  const second = await startStockTestServer(t, { databaseUrl: scopedUrl(name) });
  const next = await stockTestLogin(second);
  assert.equal((await next.ok(resolve(ean))).productId, pen.id);
  assert.equal((await next.ok("/api/bootstrap?view=pos")).posBarcodeEnabled, true);
  const snapshot = await barcodeBackupState(source);
  assert.ok(snapshot.posBarcodeRegistry.some(row => row.code === internal && row.productId === pen.id));
  restored.pool = new pg.Pool(databaseConfig(scopedUrl(restore)));
  await restored.init();
  await restored.pool.query("UPDATE app_state SET data = $1::jsonb WHERE id = 'main'", [JSON.stringify(snapshot)]);
  await restored.init();
  const result = await barcodeBackupState(restored);
  assert.deepEqual(result.posBarcodeRegistry, snapshot.posBarcodeRegistry);
  assert.equal(result.posBarcodeEnabled, true);
  assert.equal((await restored.pool.query("SELECT data ? 'posBarcodeRegistry' AS staged FROM app_state WHERE id = 'main'")).rows[0].staged, false);
  await restored.init();
});
