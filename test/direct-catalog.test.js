import test from "node:test";
import assert from "node:assert/strict";
import { DIRECT_PRODUCTS } from "../lib/direct-catalog.js";
import { calculateOrder } from "../lib/domain.js";
import { Store, seedState } from "../lib/store.js";

test("daftar Akrilik dan Stempel memiliki SKU dan harga masing-masing", () => {
  assert.equal(DIRECT_PRODUCTS.filter((item) => item.category === "Akrilik").length, 27);
  assert.equal(DIRECT_PRODUCTS.filter((item) => item.category === "Stempel").length, 30);
  assert.equal(new Set(DIRECT_PRODUCTS.map((item) => item.id)).size, 57);
  assert.equal(new Set(DIRECT_PRODUCTS.map((item) => item.sku)).size, 57);
  assert.ok(DIRECT_PRODUCTS.every((item) => item.quickSale && item.priceBasis === "unit" && item.finishingIds.length === 0));
  const prices = new Map(DIRECT_PRODUCTS.map((item) => [item.name, item.price]));
  assert.equal(prices.get("Akrilik Display 7x4"), 12000);
  assert.equal(prices.get("Akrilik Wall Frame A1"), 575000);
  assert.equal(prices.get("Stempel Bulat D42"), 130000);
  assert.equal(prices.get("Stempel Flash Ink - Purple"), 10000);
  assert.equal(prices.get("Stempel PP 80x103"), 150000);
});

test("produk langsung masuk pesanan dengan harga per jumlah", () => {
  const state = seedState();
  const acrylic = state.products.find((item) => item.name === "Akrilik Kartu Nama");
  const stamp = state.products.find((item) => item.name === "Stempel Bulat D12");
  const order = calculateOrder([acrylic, stamp], [
    { productId: acrylic.id, quantity: 2 }, { productId: stamp.id, quantity: 3 }
  ]);
  assert.equal(order.total, 2 * 40000 + 3 * 100000);
});

test("migrasi dua kategori menjaga produk dan pesanan lama serta tidak menggandakan SKU", async () => {
  const store = new Store();
  store.memory.catalogVersion = 12;
  store.memory.products = store.memory.products.filter((item) => !item.quickSale);
  store.memory.catalogOptions.categories = store.memory.catalogOptions.categories.filter((item) => !["Akrilik", "Stempel"].includes(item));
  const old = store.memory.products.find((item) => item.id === "business-card");
  old.price = 77777;
  store.memory.orders.push({ id: "old-order", items: [{ productId: old.id, unitPrice: 1000 }] });
  const first = await store.read();
  assert.equal(first.products.filter((item) => item.quickSale).length, 57);
  assert.ok(first.catalogOptions.categories.includes("Akrilik") && first.catalogOptions.categories.includes("Stempel"));
  assert.equal(first.products.find((item) => item.id === old.id).price, 77777);
  assert.equal(first.orders[0].items[0].unitPrice, 1000);
  await store.mutate(() => {});
  const second = await store.read();
  assert.equal(second.catalogVersion, 13);
  assert.equal(second.products.filter((item) => item.quickSale).length, 57);
});
