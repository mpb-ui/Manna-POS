import test from "node:test";
import assert from "node:assert/strict";
import { DTF_PACKAGES, DTF_SHIRT_MATERIALS, DTF_SHIRT_PRODUCT } from "../lib/dtf-catalog.js";
import { calculateLine } from "../lib/domain.js";
import { ensureShirtStock, shirtAvailability } from "../lib/dtf-stock.js";
import { Store, seedState } from "../lib/store.js";

const variants = [
  { color: "Hitam", size: "M", quantity: 2 },
  { color: "Putih", size: "S", quantity: 3 },
  { color: "Hitam", size: "XXL", quantity: 1 }
];

test("satu produk DTF memiliki sembilan paket harga dan sepuluh SKU stok", () => {
  const state = seedState();
  assert.equal(state.products.filter((item) => item.dtfShirt).length, 1);
  assert.deepEqual(DTF_PACKAGES.map((item) => item.price), [95000, 100000, 120000, 135000, 110000, 130000, 100000, 120000, 145000]);
  assert.equal(DTF_SHIRT_MATERIALS.length, 10);
  assert.equal(new Set(DTF_SHIRT_MATERIALS.map((item) => item.sku)).size, 10);
  assert.ok(DTF_SHIRT_MATERIALS.every((item) => state.inventory.some((row) => row.materialId === item.id && row.quantity === 0)));
});

test("paket hanya menentukan harga; stok mengikuti warna dan ukuran, XXL menambah Rp15.000 per kaos", () => {
  const line = calculateLine(DTF_SHIRT_PRODUCT, { dtfPackageId: "logo-a4", shirtVariants: variants });
  assert.equal(line.quantity, 6);
  assert.equal(line.baseTotal, 6 * 120000 + 15000);
  assert.deepEqual(line.materials.map((item) => [item.sku, item.units]), [["KAOS-HIT-M", 2], ["KAOS-PUT-S", 3], ["KAOS-HIT-XXL", 1]]);
  const other = calculateLine(DTF_SHIRT_PRODUCT, { dtfPackageId: "a3-a3", shirtVariants: variants });
  assert.deepEqual(other.materials, line.materials);
  assert.equal(other.baseTotal, 6 * 145000 + 15000);
  assert.throws(() => calculateLine(DTF_SHIRT_PRODUCT, { dtfPackageId: "unknown", shirtVariants: variants }), /paket sablon/i);
  assert.throws(() => calculateLine(DTF_SHIRT_PRODUCT, { dtfPackageId: "logo", shirtVariants: [variants[0], variants[0]] }), /lebih dari sekali/i);
  assert.throws(() => calculateLine(DTF_SHIRT_PRODUCT, { dtfPackageId: "logo", shirtVariants: [{ color: "Hitam", size: "M", quantity: 1.5 }] }), /tidak valid/i);
});

test("reservasi pesanan terbayar mencegah penjualan melebihi stok dan selesai mengurangi stok fisik sekali", () => {
  const state = seedState();
  for (const row of state.inventory.filter((item) => item.category === "Kaos Polos DTF")) row.quantity = 5;
  const first = { id: "first", paymentConfirmed: true, stockCommitted: false, items: [calculateLine(DTF_SHIRT_PRODUCT, { dtfPackageId: "logo", shirtVariants: [{ color: "Hitam", size: "M", quantity: 3 }] })] };
  state.orders.push(first);
  const second = { id: "second", paymentConfirmed: false, stockCommitted: false, items: [calculateLine(DTF_SHIRT_PRODUCT, { dtfPackageId: "logo-logo", shirtVariants: [{ color: "Hitam", size: "M", quantity: 3 }] })] };
  assert.equal(shirtAvailability(state).find((item) => item.color === "Hitam" && item.size === "M").available, 2);
  assert.throws(() => ensureShirtStock(state, second), /tidak cukup/i);
  second.items[0] = calculateLine(DTF_SHIRT_PRODUCT, { dtfPackageId: "logo-logo", shirtVariants: [{ color: "Hitam", size: "M", quantity: 2 }] });
  ensureShirtStock(state, second);
  state.orders.push(second);
  second.paymentConfirmed = true;
  assert.equal(shirtAvailability(state).find((item) => item.color === "Hitam" && item.size === "M").available, 0);
  ensureShirtStock(state, first, { physical: true });
  state.inventory.find((item) => item.sku === "KAOS-HIT-M").quantity -= 3;
  first.stockCommitted = true;
  assert.equal(shirtAvailability(state).find((item) => item.color === "Hitam" && item.size === "M").available, 0);
});

test("migrasi DTF menambah stok nol tanpa mengubah stok atau harga lama", async () => {
  const store = new Store();
  store.memory.catalogVersion = 8;
  store.memory.products = store.memory.products.filter((item) => !item.dtfShirt);
  store.memory.materials = store.memory.materials.filter((item) => item.category !== "Kaos Polos DTF");
  store.memory.inventory = store.memory.inventory.filter((item) => item.category !== "Kaos Polos DTF");
  const old = store.memory.inventory.find((item) => item.sku === "BHN-FL280");
  old.quantity = 123;
  const migrated = await store.read();
  assert.equal(migrated.products.filter((item) => item.dtfShirt).length, 1);
  assert.equal(migrated.inventory.filter((item) => item.category === "Kaos Polos DTF").length, 10);
  assert.equal(migrated.inventory.find((item) => item.sku === "BHN-FL280").quantity, 123);
  await store.mutate(() => {});
  const again = await store.read();
  assert.equal(again.inventory.filter((item) => item.category === "Kaos Polos DTF").length, 10);
});
