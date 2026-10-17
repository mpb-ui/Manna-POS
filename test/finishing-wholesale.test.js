import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFinishingTiers, finishingPriceForUnits, manualAreaFinishing, manualLfCutting } from "../public/finishing-pricing.js";
import { calculateLine } from "../lib/domain.js";
import { PRODUCTS } from "../lib/store.js";

const tiers = [{ min: 10, max: 19, price: 8000 }, { min: 20, max: null, price: 6000 }];
test("finishing grosir memakai batas inklusif dan harga biasa di luar rentang", () => {
  const finish = { price: 10000, priceTiers: tiers };
  for (const [units, price] of [[1, 10000], [10, 8000], [19, 8000], [19.5, 10000], [20, 6000], [100, 6000]]) assert.equal(finishingPriceForUnits(finish, units), price);
  assert.equal(finishingPriceForUnits({ price: 10000 }, 100), 10000);
  assert.equal(finishingPriceForUnits({ price: 10000, priceTiers: [{ min: 1.5, price: 0 }] }, 1.5), 0);
});
test("validasi finishing grosir menolak rentang overlap dan data tidak valid", () => {
  assert.deepEqual(normalizeFinishingTiers([{ min: "20", max: "", price: "6000" }, { min: "10", max: "19", price: "8000" }]), tiers);
  for (const value of [null, {}, Array(11).fill(tiers[0]), [{ min: 0, price: 5 }], [{ min: 1, price: "" }], [{ min: 1, price: -1 }], [{ min: 1, max: 0, price: 5 }], [{ min: "x", price: 5 }], [{ min: 1, price: 5 }, { min: 2, price: 4 }], [{ min: 1, max: 2, price: 5 }, { min: 2, price: 4 }]]) assert.throws(() => normalizeFinishingTiers(value));
});
for (const rule of ["free", "area", "point", "perimeter", "top_bottom", "left_right", "length"]) {
  test(`finishing ${rule} menerapkan grosir dari jumlah finishing, bukan jumlah produk`, () => {
    const finish = { id: "test", name: "Test", rule, price: 10000, priceTiers: structuredClone(tiers) };
    const product = { ...PRODUCTS.find((p) => p.id === "poster-albatros"), finishing: [finish] };
    const line = calculateLine(product, { width: 0.9, length: 1, quantity: rule === "area" ? 20 : 1, finishing: [{ id: "test", units: 10 }] });
    assert.equal(line.finishing[0].unitPrice, 8000);
    assert.equal(line.finishingTotal, Math.round(line.finishing[0].units * 8000));
    finish.priceTiers[0] = { min: 10, max: 19, price: 5000 };
    assert.equal(line.finishing[0].unitPrice, 8000, "harga tersimpan tidak berubah ketika master diubah");
    finish.priceTiers = tiers;
  });
}
test("Kisscut LF grosir menggunakan luas manual", () => {
  const product = { ...PRODUCTS.find((p) => p.id === "lf-sticker-white-glossy"), finishing: [{ id: "test", name: "Kisscut LF", rule: "area", price: 10000, priceTiers: [{ min: 2.5, max: null, price: 7000 }] }] };
  const line = calculateLine(product, { width: 1.5, length: 1, quantity: 1, finishing: [{ id: "test", units: 2.5 }] });
  assert.equal(line.finishingTotal, 17500);
});

test("Cutting LF Manual recognizes existing master identities and both display names", () => {
  for (const finish of [
    { id: "fin-lf-manual", name: "Nama baru" },
    { id: "manual-cut-lf", name: "Nama lama" },
    { id: "custom", name: "Cutting Manual LF" },
    { id: "custom", name: "Cutting LF Manual" }
  ]) {
    assert(manualLfCutting({ ...finish, rule: "area" }));
    assert(manualAreaFinishing({ ...finish, rule: "area" }));
    assert.equal(manualLfCutting({ ...finish, rule: "free" }), false);
  }
  assert.equal(manualAreaFinishing({ name: "Laminasi", rule: "area" }), false);
  assert.equal(manualAreaFinishing({ name: "Transfer Sticker", rule: "area" }), false);
  assert(manualAreaFinishing({ name: "Kisscut LF", rule: "area" }));
});

test("Cutting LF Manual starts at one and uses entered decimal units independently of image area and product quantity", () => {
  const finish = { id: "fin-lf-manual", name: "Cutting Manual LF", rule: "area", price: 45000, priceTiers: [{ min: 1.3, max: null, price: 40000 }] };
  for (const id of ["poster-albatros", "poster-luster", "lf-sticker-white-glossy"]) {
    const product = { ...PRODUCTS.find(p => p.id === id), finishing: [finish] };
    for (const quantity of [1, 10]) {
      const input = { width: 1.5, length: 3, quantity, finishing: [{ id: finish.id }] };
      assert.equal(calculateLine(product, input).finishing[0].units, 1);
      for (const units of [1, 1.1, 1.2, 1.3, 2.7]) {
        const line = calculateLine(product, { ...input, finishing: [{ id: finish.id, units, note: "Potong sesuai garis" }] });
        assert.equal(line.finishing[0].units, units);
        assert.equal(line.finishing[0].subtotal, Math.round(units * (units >= 1.3 ? 40000 : 45000)));
        assert.equal(line.finishing[0].note, "Potong sesuai garis");
      }
      // Old drafts may carry more precise quantities from the previous automatic area calculation.
      assert.equal(calculateLine(product, { ...input, finishing: [{ id: finish.id, units: 1.2345 }] }).finishing[0].units, 1.2345);
      assert.throws(() => calculateLine(product, { ...input, finishing: [{ id: finish.id, units: Infinity }] }), /Jumlah finishing/);
    }
  }
});
