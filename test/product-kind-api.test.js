import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { secureFetch } from './helpers/http.js';
import { PRODUCT_KIND, supportsProductKind } from '../public/product-kind.js';

test('jenis produk tersedia pada kategori Akrilik dan Frame Foto, termasuk nama di katalog lama', () => {
  for (const label of ['Akrilik', 'Akrilik & Frame', 'Frame Foto', 'Foto & Frame']) {
    assert.equal(supportsProductKind('cat-custom', label), true, label);
  }
  assert.equal(supportsProductKind('akrilik', 'Akrilik Baru'), true);
  assert.equal(supportsProductKind('stempel', 'Stempel'), false);
  assert.equal(supportsProductKind('print-a3', 'Print A3+'), false);
});

test('barang dagangan Akrilik dan Frame Foto memakai stok SKU saat pembayaran, jasa memakai stok bahan saat produksi', async () => {
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: '', PORT: String(port), APP_PIN: '1234' },
    stdio: 'ignore'
  });
  const exited = new Promise(resolve => child.once('exit', resolve));

  try {
    for (let i = 0; i < 60; i++) {
      if (await secureFetch(origin + '/api/health').then(r => r.ok, () => false)) break;
      await delay(50);
    }
    const login = await secureFetch(origin + '/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', pin: '1234' })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    async function request(path, method = 'GET', body) {
      return secureFetch(origin + path, {
        method,
        headers: { cookie, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    }
    async function ok(...args) {
      const response = await request(...args);
      const data = await response.json();
      assert.ok(response.ok, JSON.stringify(data));
      return data;
    }

    await ok('/api/categories/products/Akrilik', 'PUT', { name: 'Akrilik & Frame' });
    await ok('/api/categories/products', 'POST', { name: 'Frame Foto' });
    const before = await ok('/api/bootstrap?view=master');
    const oldAcrylic = before.allProducts.find(p => p.category === 'Akrilik & Frame' && p.quickSale);
    assert.ok(oldAcrylic);
    const updateAcrylic = body => ok(`/api/products/${oldAcrylic.id}`, 'PUT', body);
    const legacy = await updateAcrylic({ ...oldAcrylic, productEditorVersion: 1 });
    assert.equal(legacy.quickSale, true);
    assert.equal(legacy.retailStockSku, undefined);
    const acrylic = await updateAcrylic({ ...legacy, productKind: PRODUCT_KIND.MERCHANDISE });
    assert.equal(acrylic.retailStockSku, oldAcrylic.sku);

    const frameInput = {
      productEditorVersion: 1, sku: 'FRAME-SIAP-QA', name: 'Frame Foto Siap QA',
      category: 'Frame Foto', saleUnit: 'pcs', price: 45000, productKind: PRODUCT_KIND.MERCHANDISE
    };
    const frame = await ok('/api/products', 'POST', frameInput);
    assert.equal(frame.retailStockSku, frame.sku);
    const stockState = () => ok('/api/bootstrap?view=stock');
    const stockFor = async product => (await stockState()).inventory.find(row => row.productId === product.id);
    for (const product of [acrylic, frame]) {
      const row = await stockFor(product);
      assert.equal(row.sku, product.sku);
      assert.equal(row.stockMethod, 'UNIT');
      assert.equal(row.unit, 'pcs');
      assert.equal(row.quantity, 0);
      assert.ok(!row.materialId);
      await ok(`/api/inventory/${row.sku}`, 'PATCH', { change: 12, reason: 'Saldo awal QA' });
    }
    const invalid = await request(`/api/products/${frame.id}`, 'PUT', { ...frame, saleUnit: 'm²' });
    assert.equal(invalid.status, 400);

    const custom = await ok('/api/products', 'POST', {
      ...frameInput, sku: 'FRAME-JASA-QA', name: 'Frame Foto Custom QA',
      productKind: PRODUCT_KIND.PRODUCTION, machineIds: ['mach-digital'],
      materialSources: [{ materialId: 'mat-art260', quantity: 1 }]
    });
    const materialBalance = async () => (await stockState()).inventory.find(row => row.materialId === 'mat-art260').quantity;
    const startingMaterial = await materialBalance();
    const order = await ok('/api/orders', 'POST', {
      customerName: 'Uji Barang Dagangan', phone: '080000000021',
      items: [acrylic, frame, custom].map(p => ({ productId: p.id, quantity: 2 }))
    });
    assert.equal((await stockFor(frame)).quantity, 12);
    assert.deepEqual(order.items.map(item => item.stockTiming), ['SALE', 'SALE', 'PRODUCTION']);
    assert.deepEqual(order.items.map(item => item.needsProduction), [false, false, true]);
    assert.deepEqual(order.items[0].materials, []);
    assert.deepEqual(order.items[1].materials, []);

    const payment = { method: 'TUNAI', amount: order.total, requestId: 'qa-frame-dagang-pay' };
    const paymentPath = `/api/orders/${order.id}/payments`;
    const paid = await ok(paymentPath, 'POST', payment);
    await ok(paymentPath, 'POST', payment);
    assert.deepEqual(paid.items.map(item => item.status), ['SELESAI', 'SELESAI', 'DESAIN']);
    assert.equal((await stockFor(acrylic)).quantity, 10);
    assert.equal((await stockFor(frame)).quantity, 10);
    assert.equal(await materialBalance(), startingMaterial);

    const printItem = `/api/orders/${order.id}/items/${paid.items[2].itemId}`;
    await ok(printItem + '/design-pic', 'PATCH', { designPic: 'Gema' });
    await ok(printItem + '/status', 'PATCH', { status: 'CETAK' });
    assert.equal(await materialBalance(), startingMaterial - 2);
    assert.equal((await stockFor(frame)).quantity, 10);

    const production = await updateAcrylic({ ...acrylic, productKind: PRODUCT_KIND.PRODUCTION });
    assert.equal(production.quickSale, false);
    assert.equal((await stockFor(production)).quantity, 10);
    const newOrder = await ok('/api/orders', 'POST', {
      customerName: 'Uji Jasa Akrilik', phone: '080000000022',
      items: [{ productId: production.id, quantity: 1 }]
    });
    assert.equal(newOrder.items[0].stockTiming, 'PRODUCTION');
    assert.equal(newOrder.items[0].needsProduction, true);
    assert.equal(newOrder.items[0].retailStockSku, '');
    assert.equal((await ok('/api/order-history/' + order.id)).items[0].stockTiming, 'SALE');
  } finally {
    child.kill();
    await exited;
  }
});
