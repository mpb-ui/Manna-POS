import test from "node:test";
import assert from "node:assert/strict";
import { roundBillingLength, calculateLine, allowedNextStatus, STATUS } from "../lib/domain.js";
import { PRODUCTS } from "../lib/store.js";

test("panjang ditagihkan dibulatkan per 50 cm dengan minimum 1 m", () => {
  assert.equal(roundBillingLength(0.4), 1);
  assert.equal(roundBillingLength(1.2), 1.5);
  assert.equal(roundBillingLength(2), 2);
});

test("FL 280 menghitung luas dan mata ayam", () => {
  const product = PRODUCTS.find((item) => item.id === "fl-280-glossy");
  const line = calculateLine(product, { width: 1, length: 1.2, quantity: 1, finishing: [{ id: "eyelets", units: 4 }] });
  assert.equal(line.billedLength, 1.5);
  assert.equal(line.baseTotal, 45000);
  assert.equal(line.finishingTotal, 2000);
  assert.equal(line.subtotal, 47000);
  assert.equal(line.stockConsumption, 1.5);
});

test("status hanya bergerak satu langkah", () => {
  assert.equal(allowedNextStatus(STATUS.WAITING_PAYMENT), STATUS.DESIGN);
  assert.equal(allowedNextStatus(STATUS.FINISHING), STATUS.DONE);
  assert.equal(allowedNextStatus(STATUS.PICKED_UP), null);
});

test("quantity finishing mengikuti input kasir dan tidak dikali qty produk", () => {
  const product = PRODUCTS.find((item) => item.id === "fl-280-glossy");
  const line = calculateLine(product, {
    width: 1, length: 1, quantity: 3,
    finishing: [{ id: "seaming", units: 4 }],
    productionNote: "Tiga file berbeda"
  });
  assert.equal(line.baseTotal, 90000);
  assert.equal(line.finishingTotal, 10000);
  assert.equal(line.productionNote, "Tiga file berbeda");
});

test("produk satuan menghitung quantity dan finishing masing-masing", () => {
  const product = {
    id: "card", name: "Kartu Nama", price: 75000, priceBasis: "unit", unitName: "box",
    finishing: [{ id: "lam", name: "Laminasi", price: 20000, rule: "free" }]
  };
  const line = calculateLine(product, { quantity: 2, finishing: [{ id: "lam", units: 2 }] });
  assert.equal(line.baseTotal, 150000);
  assert.equal(line.finishingTotal, 40000);
  assert.equal(line.subtotal, 190000);
  assert.equal(line.stockSku, "card-unit");
  assert.equal(line.stockConsumption, 2);
  assert.equal(line.displaySize, "2 box");
});
