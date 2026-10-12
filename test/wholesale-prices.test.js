import test from 'node:test';
import assert from 'node:assert/strict';
import { effectivePriceTiers, wholesalePriceRows } from '../public/wholesale-prices.js';
import { selectedVariantPrice } from '../lib/domain.js';

const tiers = [{ min: 11, max: 50, price: 5000 }, { min: 51, max: null, price: 4000 }];
const product = { price: 9500, wholesaleEnabled: true, priceTiers: tiers };

test('wholesale information uses the same product, material and combination precedence as billing', () => {
  const variantTiers = [{ min: 5, max: null, price: 7000 }];
  const scenarios = [
    [null, null, null, tiers],
    [null, { price: 16000 }, null, []],
    [{ price: 12000 }, null, null, []],
    [null, { price: 16000, priceTiers: variantTiers }, null, variantTiers],
    [null, { priceTiers: variantTiers }, { price: 18000 }, []],
    [null, { price: 16000 }, { price: 18000, priceTiers: variantTiers }, variantTiers],
    [null, {}, {}, tiers]
  ];
  for (const [fixed, material, combination, expected] of scenarios) {
    assert.deepEqual(effectivePriceTiers(product, fixed, material, combination), expected);
    const retail = combination?.price ?? material?.price ?? fixed?.price ?? product.price;
    const rows = wholesalePriceRows(expected, retail);
    for (const quantity of [1, 4, 5, 10, 11, 50, 51, 501]) {
      const row = rows.find(row => quantity >= row.min && (row.max == null || quantity <= row.max));
      assert.equal(row?.price ?? retail, selectedVariantPrice(product, quantity, fixed, material, combination));
    }
  }
});

test('wholesale information disappears when disabled or absent, preserving variant tier overrides', () => {
  assert.deepEqual(effectivePriceTiers({ ...product, wholesaleEnabled: false }), []);
  assert.deepEqual(effectivePriceTiers({ ...product, priceTiers: [] }), []);
  assert.deepEqual(wholesalePriceRows([], 9500), []);
  assert.deepEqual(effectivePriceTiers({ ...product, wholesaleEnabled: false }, null, { priceTiers: tiers }), tiers);
});

test('tier boundaries and gaps show retail price instead of extending a wholesale range', () => {
  const rows = wholesalePriceRows([{ min: 21, max: 30, price: 4000 }, { min: 11, max: 15, price: 5000 }], 9500);
  assert.deepEqual(rows, [
    { min: 1, max: 10, price: 9500, retail: true },
    { min: 11, max: 15, price: 5000, retail: false },
    { min: 16, max: 20, price: 9500, retail: true },
    { min: 21, max: 30, price: 4000, retail: false },
    { min: 31, max: null, price: 9500, retail: true }
  ]);
});

test('independent one-side and two-side products retain their own tiers and prices', () => {
  const twoSide = { price: 16000, wholesaleEnabled: true, priceTiers: [{ min: 11, max: null, price: 9000 }] };
  assert.equal(wholesalePriceRows(effectivePriceTiers(product), product.price).find(row => row.min === 11).price, 5000);
  assert.equal(wholesalePriceRows(effectivePriceTiers(twoSide), twoSide.price).find(row => row.min === 11).price, 9000);
  assert.deepEqual(product.priceTiers, tiers);
});
