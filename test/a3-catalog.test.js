import test from "node:test";
import assert from "node:assert/strict";
import { A3_CATALOG_PRODUCTS, A3_PAPER_STOCK } from "../lib/a3-catalog.js";
import { A3_READY_PRODUCTS } from "../lib/a3-ready-catalog.js";
import { Store, seedState } from "../lib/store.js";
import { calculateLine } from "../lib/domain.js";

test("katalog A3+ memiliki keluarga kertas A–Z dan sticker tanpa dua sisi", () => {
  const paper = A3_CATALOG_PRODUCTS.filter((item) => item.a3Kind === "paper");
  const stickers = A3_CATALOG_PRODUCTS.filter((item) => item.a3Kind === "sticker");
  assert.equal(new Set(paper.map((item) => item.a3Family)).size, 13);
  assert.equal(stickers.length, 11);
  assert.ok(stickers.every((item) => !item.a3Side && item.finishingIds.every((id) => id.startsWith("fin-a3-sticker-"))));
  assert.equal(new Set(A3_CATALOG_PRODUCTS.map((item) => item.id)).size, A3_CATALOG_PRODUCTS.length);
  assert.ok(paper.some((item) => item.a3Variant === "AP 230" && item.a3Side === "1S"));
  assert.ok(!paper.some((item) => item.a3Variant === "AP 230" && item.a3Side === "2S"));
});

test("Cream/White dan setiap gramasi AP memakai bahan kertas tersendiri untuk kedua sisi cetak", () => {
  const state = seedState();
  assert.equal(A3_PAPER_STOCK.length, 15);
  assert.equal(new Set(A3_PAPER_STOCK.map((item) => item.id)).size, 15);
  assert.equal(new Set(A3_PAPER_STOCK.map((item) => item.sku)).size, 15);
  const colorFamilies = ["Akasia", "Concorde", "Copenhagen", "Hammer"];
  for (const family of colorFamilies) {
    assert.notEqual(A3_PAPER_STOCK.find((item) => item.family === family && item.variant === "Cream").id,
      A3_PAPER_STOCK.find((item) => item.family === family && item.variant === "White").id);
  }
  for (const material of A3_PAPER_STOCK) {
    assert.ok(state.materials.some((item) => item.id === material.id));
    assert.ok(state.inventory.some((item) => item.materialId === material.id));
    const products = state.products.filter((item) => item.a3Family === material.family && item.a3Variant === material.variant);
    assert.ok(products.length >= 1);
    for (const product of products) {
      const line = calculateLine(product, { quantity: 3, finishing: [] });
      assert.deepEqual(line.materials.map((item) => [item.materialId, item.units]), [[material.id, 3]]);
    }
  }
  const ap260 = state.inventory.find((item) => item.materialId === "mat-art260");
  assert.equal(ap260.quantity, 1200);
});

test("migrasi kertas A3+ menambah stok tanpa mengubah pemetaan khusus dan pesanan lama", async () => {
  const store = new Store();
  store.memory.catalogVersion = 14;
  const newIds = new Set(A3_PAPER_STOCK.filter((item) => item.id !== "mat-art260").map((item) => item.id));
  store.memory.materials = store.memory.materials.filter((item) => !newIds.has(item.id));
  store.memory.inventory = store.memory.inventory.filter((item) => !newIds.has(item.materialId));
  for (const product of store.memory.products.filter((item) => item.a3Kind === "paper")) product.materialSources = [];
  const custom = store.memory.products.find((item) => item.a3Family === "Akasia" && item.a3Variant === "Cream" && item.a3Side === "1S");
  custom.materialSources = [{ materialId: "mat-art260", quantity: 2 }];
  const existing = store.memory.inventory.find((item) => item.materialId === "mat-art260");
  existing.quantity = 432;
  store.memory.orders.push({ id: "before-paper-migration", items: [{ productId: custom.id, materials: [{ materialId: "mat-art260", units: 2 }] }] });
  const first = await store.read();
  assert.equal(first.inventory.find((item) => item.materialId === "mat-art260").quantity, 432);
  assert.deepEqual(first.products.find((item) => item.id === custom.id).materialSources.map((item) => item.materialId), ["mat-art260"]);
  assert.deepEqual(first.products.find((item) => item.a3Family === "Akasia" && item.a3Variant === "Cream" && item.a3Side === "2S").materialSources.map((item) => item.materialId), ["mat-a3-akasia-cream"]);
  assert.equal(first.orders[0].items[0].materials[0].units, 2);
  await store.mutate(() => {});
  const second = await store.read();
  assert.equal(second.catalogVersion, 15);
  assert.equal(second.materials.filter((item) => newIds.has(item.id)).length, newIds.size);
  assert.equal(second.inventory.filter((item) => newIds.has(item.materialId)).length, newIds.size);
});

test("harga dan quantity finishing A3+ dihitung oleh server per SKU", () => {
  const state = seedState();
  const hvs = state.products.find((item) => item.a3Family === "HVS" && item.a3Side === "2S");
  const paper = state.products.find((item) => item.a3Variant === "AP 210" && item.a3Side === "1S");
  const sticker = state.products.find((item) => item.a3Kind === "sticker" && item.a3Variant === "White Glossy");
  const hydrated = (item) => ({ ...item, finishing: item.finishingIds.map((id) => state.finishings.find((finish) => finish.id === id)) });
  assert.equal(calculateLine(hydrated(hvs), { quantity: 2, finishing: [] }).baseTotal, 16000);
  const paperLine = calculateLine(hydrated(paper), { quantity: 10, finishing: [{ id: "fin-a3-laminating-a4", units: 3 }] });
  assert.equal(paperLine.baseTotal, 90000);
  assert.equal(paperLine.finishingTotal, 18000);
  const stickerLine = calculateLine(hydrated(sticker), { quantity: 5, finishing: [{ id: "fin-a3-sticker-kisscut", units: 2 }] });
  assert.equal(stickerLine.baseTotal, 87500);
  assert.equal(stickerLine.finishingTotal, 20000);
});

test("HVS Print BW dan Print Warna memiliki harga per sisi dan SKU berbeda", () => {
  const state = seedState();
  const hvs = state.products.filter((item) => item.a3Family === "HVS");
  assert.deepEqual(hvs.map((item) => [item.a3PrintMode, item.a3Side, item.price]).sort(), [
    ["BW", "1S", 1500], ["BW", "2S", 3000], ["Warna", "1S", 4000], ["Warna", "2S", 8000]
  ]);
  assert.equal(new Set(hvs.map((item) => item.id)).size, 4);
  for (const item of hvs) {
    assert.equal(calculateLine(item, { quantity: 2, finishing: [] }).baseTotal, item.price * 2);
  }
});

test("migrasi HVS menambah BW dan memperjelas SKU warna tanpa mengubah pesanan lama", async () => {
  const store = new Store();
  store.memory.catalogVersion = 9;
  store.memory.products = store.memory.products.filter((item) => item.a3Family !== "HVS" || item.a3PrintMode !== "BW");
  const color = store.memory.products.find((item) => item.a3Family === "HVS" && item.a3Side === "1S");
  const originalId = color.id;
  color.price = 9999;
  delete color.a3PrintMode;
  store.memory.orders.push({ id: "old-order", items: [{ productId: originalId, unitPrice: 4000 }] });
  const state = await store.read();
  assert.equal(state.products.find((item) => item.id === originalId).price, 4000);
  assert.equal(state.products.find((item) => item.id === originalId).a3PrintMode, "Warna");
  assert.equal(state.products.filter((item) => item.a3Family === "HVS").length, 4);
  assert.equal(state.orders[0].items[0].productId, originalId);
  await store.mutate(() => {});
  assert.equal((await store.read()).products.filter((item) => item.a3Family === "HVS").length, 4);
});

test("migrasi katalog menambahkan SKU tanpa mengubah produk dan harga yang sudah ada", async () => {
  const store = new Store();
  store.memory.catalogVersion = 7;
  store.memory.products = store.memory.products.filter((item) => !item.a3Kind);
  store.memory.finishings = store.memory.finishings.filter((item) => !item.id.startsWith("fin-a3-sticker-") && !item.id.startsWith("fin-a3-laminating-"));
  const legacy = store.memory.products.find((item) => item.id === "art-paper-260");
  legacy.price = 12345;
  const first = await store.read();
  assert.equal(first.products.find((item) => item.id === legacy.id).price, 12345);
  assert.equal(first.products.filter((item) => item.a3Kind).length, A3_CATALOG_PRODUCTS.length + A3_READY_PRODUCTS.length);
  assert.ok(first.products.find((item) => item.a3Kind === "sticker").finishing.length);
  await store.mutate(() => {});
  const second = await store.read();
  assert.equal(second.products.length, first.products.length);
  assert.equal(second.finishings.length, first.finishings.length);
});
