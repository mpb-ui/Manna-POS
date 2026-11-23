import test from 'node:test';
import assert from 'node:assert/strict';
import { discountedPrice } from '../lib/domain.js';
import { readCampaign } from '../lib/home-campaign.js';
import { homeProductsHtml } from '../public/pos-home.js';

const format = {
  e: String,
  money: value => `Rp ${Number(value).toLocaleString('id-ID')}`,
  promoPrice: discountedPrice
};
const product = {
  id: 'banner',
  name: 'FL 280 Glossy',
  price: 30000,
  unitLabel: '/m lari',
  featured: true,
  active: true,
  discount: {
    enabled: true,
    type: 'percent',
    value: 10,
    startsAt: '2026-11-23T00:00:00.000+08:00',
    endsAt: '2026-11-23T23:59:59.999+08:00'
  }
};

test('featured products appear once on Home and move into promotions for the WITA promo period', () => {
  const regular = { id: 'paper', name: 'Albatros', price: 150000, featured: true };
  const render = at => homeProductsHtml([product, regular], format, new Date(at));

  for (const at of ['2026-11-22T23:59:59.999+08:00', '2026-11-24T00:00:00.000+08:00']) {
    const html = render(at);
    assert.doesNotMatch(html, /Produk Sedang Promo/);
    assert.match(html, /Produk Terlaris.*data-config-product="banner"/s);
    assert.match(html, /<strong>Rp 30\.000<\/strong>/);
  }

  for (const at of [product.discount.startsAt, product.discount.endsAt]) {
    const html = render(at);
    assert.equal(html.match(/data-config-product="banner"/g).length, 1);
    assert.match(html, /Produk Sedang Promo.*data-config-product="banner".*Produk Terlaris.*data-config-product="paper"/s);
    assert.match(html, /Diskon 10%/);
    assert.match(html, /<s class="catalog-original-price">Rp 30\.000<\/s>/);
    assert.match(html, /<strong>Rp 27\.000<\/strong>.*\/m lari/s);
  }
});

test('Home shows a nominal promotion without requiring a featured flag', () => {
  const nominal = { ...product, featured: false, discount: { ...product.discount, type: 'nominal', value: 2000 } };
  const rows = [nominal, { ...product, id: 'inactive', active: false }, { ...product, id: 'deleted', deletedAt: product.discount.startsAt }];
  const html = homeProductsHtml(rows, format, new Date(product.discount.startsAt));

  assert.match(html, /Produk Sedang Promo.*Diskon Rp 2\.000.*<strong>Rp 28\.000<\/strong>/s);
  assert.doesNotMatch(html, /Produk Terlaris|data-config-product="(?:inactive|deleted)"/);
});

test('the saved campaign selects its own products and an unset campaign stays empty', () => {
  const activePromo = { ...product, discount: { enabled: true, type: 'percent', value: 10 } };
  const state = { products: [activePromo] };
  assert.deepEqual(readCampaign(state).items, []);

  const campaign = { title: 'Produk Pilihan', items: [{ productId: activePromo.id }] };
  assert.equal(readCampaign({ ...state, homeCampaign: campaign }), campaign);
});
