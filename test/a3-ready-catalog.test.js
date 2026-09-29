import test from "node:test";
import assert from "node:assert/strict";
import { A3_READY_FINISHINGS, A3_READY_PRODUCTS } from "../lib/a3-ready-catalog.js";
import { calculateLine } from "../lib/domain.js";
import { Store, seedState } from "../lib/store.js";

test("dropdown Produk Jadi memiliki 59 SKU unik sesuai harga daftar", () => {
  assert.equal(A3_READY_PRODUCTS.length, 59);
  assert.equal(new Set(A3_READY_PRODUCTS.map((item) => item.id)).size, 59);
  assert.ok(A3_READY_PRODUCTS.every((item) => item.category === "Print A3+" && item.a3Kind === "ready" && item.priceBasis === "unit"));
  assert.ok(A3_READY_PRODUCTS.every((item) => item.a3ReadyGroup));
  const prices = new Map(A3_READY_PRODUCTS.map((item) => [item.name, item.price]));
  assert.equal(prices.get("Kartu Nama AP260/1S"), 60000);
  assert.equal(prices.get("[5 Pcs] Map Folder A4 /2S"), 140000);
  assert.equal(prices.get("[RIM] Brosur A3 AP150 /2S"), 4275000);
  assert.equal(prices.get("[RIM] Buku Nota 1/3 Folio 1PLY"), 1074150);
  assert.equal(prices.get("[RIM] Buku Nota Full Folio 3PLY"), 1120000);
  assert.ok(!prices.has("Fee Design Nota"));
  assert.ok(!prices.has("Rounded Kartu Nama /TITIK"));
});

test("finishing Kartu Nama dan Nota terpisah serta jumlah masing-masing dihitung satu kali", () => {
  const state = seedState();
  const card = state.products.find((item) => item.name === "Kartu Nama AP260/1S");
  const nota = state.products.find((item) => item.name === "Buku Nota 1/2 Folio 1PLY");
  const folder = state.products.find((item) => item.name === "[5 Pcs] Map Folder A4 /1S");
  assert.deepEqual(card.finishingIds, ["fin-a3-card-lam-1", "fin-a3-card-lam-2", "fin-a3-card-rounded"]);
  assert.deepEqual(nota.finishingIds, ["fin-a3-nota-design"]);
  assert.deepEqual(folder.finishingIds, []);
  assert.equal(A3_READY_FINISHINGS.find((item) => item.id === "fin-a3-card-rounded").rule, "point");
  const hydrated = (item) => ({ ...item, finishing: item.finishingIds.map((id) => state.finishings.find((finish) => finish.id === id)) });
  const cardLine = calculateLine(hydrated(card), { quantity: 2, finishing: [
    { id: "fin-a3-card-lam-1", units: 2 }, { id: "fin-a3-card-lam-2", units: 3 }, { id: "fin-a3-card-rounded", units: 4 }
  ] });
  assert.equal(cardLine.baseTotal, 120000);
  assert.equal(cardLine.finishingTotal, 2 * 25000 + 3 * 45000 + 4 * 15000);
  const notaLine = calculateLine(hydrated(nota), { quantity: 2, finishing: [{ id: "fin-a3-nota-design", units: 2 }] });
  assert.equal(notaLine.baseTotal, 210000);
  assert.equal(notaLine.finishingTotal, 70000);
  assert.equal(calculateLine(hydrated(folder), { quantity: 1, finishing: [{ id: "fin-a3-card-lam-1", units: 1 }] }).finishingTotal, 0);
});

test("migrasi Produk Jadi menambah produk dan finishing tanpa menimpa pesanan lama", async () => {
  const store = new Store();
  store.memory.catalogVersion = 11;
  store.memory.products = store.memory.products.filter((item) => item.a3Kind !== "ready");
  store.memory.finishings = store.memory.finishings.filter((item) => !item.id.startsWith("fin-a3-card-") && item.id !== "fin-a3-nota-design");
  const old = store.memory.products.find((item) => item.a3Family === "HVS" && item.a3Side === "1S");
  old.price = 9876;
  store.memory.orders.push({ id: "old-order", items: [{ productId: old.id, unitPrice: 4000 }] });
  const first = await store.read();
  assert.equal(first.products.filter((item) => item.a3Kind === "ready").length, 59);
  assert.equal(first.finishings.filter((item) => A3_READY_FINISHINGS.some((finish) => finish.id === item.id)).length, 4);
  assert.equal(first.products.find((item) => item.id === old.id).price, 9876);
  assert.equal(first.orders[0].items[0].unitPrice, 4000);
  await store.mutate(() => {});
  const second = await store.read();
  assert.equal(second.catalogVersion, 14);
  assert.equal(second.products.filter((item) => item.a3Kind === "ready").length, 59);
});
