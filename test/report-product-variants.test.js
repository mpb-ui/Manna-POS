import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateOrder } from '../lib/domain.js';
import { aggregateReport } from '../lib/reports.js';
import { Store } from '../lib/store.js';

const catalog = await new Store().read();
const owner = {role:'OWNER', id:'owner'};
const period = {from:'2026-10-01', to:'2026-10-31'};
const invoice = (id, items, extra = {}) => ({
  id, code:id, customerName:'Pelanggan', status:'MENUNGGU_PEMBAYARAN',
  createdAt:'2026-10-01T03:00:00Z', items, payments:[],
  total:items.reduce((total, item) => total + item.subtotal, 0), ...extra
});
const rankings = (orders, products = catalog.products, range = period) =>
  aggregateReport({...catalog, orders, products}, owner, range);
const byName = report => Object.fromEntries(report.products.map(row => [row.label, [row.quantity, row.orders, row.sales]]));
const shirt = (color, size, quantity) => ({color,size,quantity});

test('product ranking uses shirt color and size, selected banner material, and the historical A3 print side', () => {
  const dtf = catalog.products.find(product => product.dtfShirt);
  const shirtProduct = {
    ...dtf, dtfSizeSurcharges:[{size:'XL',amount:15000}],
    dtfWholesaleTiers:[{min:4, max:null, prices:{logo:90000}}]
  };
  const products = catalog.products.map(product => product.id === dtf.id ? shirtProduct : product);
  const dtfInput = (...shirtVariants) => ({productId:dtf.id, dtfPackageId:'logo', shirtVariants});
  const items = calculateOrder(products, [
    dtfInput(shirt('Hitam','M',1), shirt('Putih','XL',1)),
    dtfInput(shirt('Hitam','M',2)),
    {productId:'display-x-banner', sizeVariantId:'albatros', quantity:1},
    {productId:'display-roll-banner', sizeVariantId:'60x160-luster', quantity:1},
    {productId:'display-roll-banner', sizeVariantId:'85x200-luster', quantity:1},
    {productId:'a3-paper-art-paper-ap-ap-150-a3-1s', quantity:2},
    {productId:'a3-paper-art-paper-ap-ap-150-a3-2s', quantity:1}
  ]).items;
  assert.deepEqual(items[0].shirtVariantSubtotals, [90000,105000]);
  assert.deepEqual(items[1].shirtVariantSubtotals, [180000]);
  const later = calculateOrder(products,[dtfInput(shirt('hitam','m',1))]).items;
  // Price and size surcharges on the report use the invoice snapshot after the catalog changes.
  const report = rankings([invoice('INV-1',items),invoice('INV-2',later)]);
  assert.deepEqual(byName(report), {
    'Sablon Kaos Hitam M':[4,2,365000],
    'Sablon Kaos Putih XL':[1,1,105000],
    'X-Banner Albatros HI-RES':[1,1,220000],
    'Roll Banner Luster HI-RES':[2,1,790000],
    'Print A3+ AP150 Cetak 1 Sisi':[2,1,16000],
    'Print A3+ AP150 Cetak 2 Sisi':[1,1,15000]
  });
  assert.equal(report.products.reduce((total, row) => total + row.sales, 0), report.summary.sales);
  assert.equal(report.products.reduce((total, row) => total + row.cost, 0), report.summary.salesCost);
});

test('configured options and historical variant display labels are supported without grouping by free-size measurements', () => {
  const id = 'display-x-banner';
  const items = [
    {productId:id, productName:'X-Banner', priceBasis:'unit', sizeVariantId:'albatros', quantity:1, subtotal:220000},
    {productId:id, productName:'X-Banner', priceBasis:'unit', displaySize:'Albatros HI-RES · 1 set', quantity:1, subtotal:220000},
    {productId:'fl-280-glossy', productName:'FL 280 Glossy', priceBasis:'sqm', width:2, billedLength:1.5,
      displaySize:'2 × 1,5 m · 1 Lembar', quantity:1, subtotal:90000},
    {productId:'custom-paper', productName:'Dokumen', priceBasis:'unit', displaySize:'1 Lembar · Warna · Cetak 2 Sisi',
      choices:[{optionLabel:'Cetak 2 Sisi'}], materialVariantLabel:'Warna', quantity:1, subtotal:5000}
  ];
  assert.deepEqual(byName(rankings([invoice('INV-1', items)])), {
    'X-Banner Albatros HI-RES':[2,1,440000],
    'FL 280 Glossy':[3,1,90000],
    'Dokumen Warna Cetak 2 Sisi':[1,1,5000]
  });
});

test('legacy shirt sales reconcile using the recorded package price or quantity when the surcharge cannot be inferred', () => {
  const item = {
    productId:'dtf-sablon-kaos', productName:'Sablon Kaos', priceBasis:'unit', quantity:2,
    unitPrice:95000, subtotal:205000, shirtVariants:[shirt('Hitam','M',1),shirt('Putih','XXL',1)]
  };
  assert.deepEqual(byName(rankings([invoice('INV-1',[item])])), {
    'Sablon Kaos Hitam M':[1,1,95000],
    'Sablon Kaos Putih XXL':[1,1,110000]
  });
  const custom = {...item, subtotal:199999};
  assert.deepEqual(byName(rankings([invoice('INV-2',[custom])])), {
    'Sablon Kaos Hitam M':[1,1,100000],
    'Sablon Kaos Putih XXL':[1,1,99999]
  });
});

test('later discounts and cancellations reverse the same rupiah shares in each product variant', () => {
  const item = {
    productId:'dtf-sablon-kaos', productName:'Sablon Kaos', priceBasis:'unit', quantity:2,
    unitPrice:95000, subtotal:190000, shirtVariants:[shirt('Hitam','M',1),shirt('Putih','XL',1)],
    shirtVariantSubtotals:[95000,95000]
  };
  const order = invoice('INV-1',[item],{
    grossTotal:190000, total:189999, invoiceDiscount:{amount:1,appliedAt:'2026-10-02T03:00:00Z'},
    cancelledAt:'2026-10-03T03:00:00Z', status:'BATAL'
  });
  const day = date => rankings([order],catalog.products,{from:date,to:date});
  assert.deepEqual(byName(day('2026-10-02')), {
    'Sablon Kaos Hitam M':[0,0,0],
    'Sablon Kaos Putih XL':[0,0,-1]
  });
  const combined = rankings([order]);
  assert.deepEqual(byName(combined), {
    'Sablon Kaos Hitam M':[0,0,0],
    'Sablon Kaos Putih XL':[0,0,0]
  });
  assert.equal(combined.summary.sales,0);
});
