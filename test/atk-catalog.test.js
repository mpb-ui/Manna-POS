import test from "node:test";
import assert from "node:assert/strict";
import { ATK_GROUPS, ATK_RETAIL_PRODUCTS } from "../lib/atk-catalog.js";
import { calculateOrder } from "../lib/domain.js";
import { Store, seedState } from "../lib/store.js";

test("setiap varian ATK dan kemasan mempunyai SKU sendiri", () => {
  assert.equal(ATK_GROUPS.length, 7);
  assert.equal(ATK_RETAIL_PRODUCTS.length, 78);
  assert.equal(new Set(ATK_RETAIL_PRODUCTS.map((item) => item.sku)).size, ATK_RETAIL_PRODUCTS.length);
  assert.equal(new Set(ATK_RETAIL_PRODUCTS.map((item) => item.id)).size, ATK_RETAIL_PRODUCTS.length);
  assert.ok(ATK_RETAIL_PRODUCTS.every((item) => item.category === "ATK" && item.retailAtK && ATK_GROUPS.includes(item.atkGroup) && item.barcode === ""));
  const unit = ATK_RETAIL_PRODUCTS.find((item) => item.name === "Amplop PPL 104");
  const box = ATK_RETAIL_PRODUCTS.find((item) => item.name === "Amplop PPL 104/BOX");
  assert.notEqual(unit.sku, box.sku);
  assert.equal(unit.saleUnit, "pcs");
  assert.equal(box.saleUnit, "box");
  const order = calculateOrder([unit, box], [{ productId: unit.id, quantity: 3 }, { productId: box.id, quantity: 2 }]);
  assert.equal(order.total, 3 * 1000 + 2 * 27500);
});

test("migrasi ATK menambah SKU tanpa menimpa produk lama dan dapat dibaca berulang", async () => {
  const store = new Store();
  store.memory.catalogVersion = 10;
  store.memory.products = store.memory.products.filter((item) => !item.retailAtK);
  const businessCard = store.memory.products.find((item) => item.id === "business-card");
  businessCard.price = 81234;
  const first = await store.read();
  assert.equal(first.products.filter((item) => item.retailAtK).length, 78);
  assert.equal(first.products.find((item) => item.id === "business-card").price, 81234);
  await store.mutate(() => {});
  const second = await store.read();
  assert.equal(second.products.filter((item) => item.retailAtK).length, 78);
  assert.equal(second.catalogVersion, 16);
});

test("state baru memuat ATK retail tanpa barcode dan mempertahankan jasa Kartu Nama", () => {
  const state = seedState();
  assert.equal(state.products.filter((item) => item.category === "ATK").length, 79);
  assert.ok(state.products.find((item) => item.id === "business-card" && !item.retailAtK));
});
