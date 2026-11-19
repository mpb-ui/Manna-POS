import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { Store } from '../lib/store.js';
import { calculateLine, calculateOrder } from '../lib/domain.js';
import { addCartLine } from '../public/cart.js';
import { PRINT_ROLL_VERSION } from '../public/outdoor-sizing.js';
import { printFinishingSections } from '../public/print-finishing.js';
import { rollConfigurationHtml } from '../public/roll-configurator.js';
import { configurationActions } from '../public/product-configurator.js';
import { secureFetch as fetch } from './helpers/http.js';

const catalog = await new Store().read();
const product = id => catalog.products.find(item => item.id === id);
const banner = product('fl-280-glossy');
const paper = product('a3-paper-art-paper-ap-ap-260-a3-1s');
const albatros = product('poster-albatros');
const matte = product('lf-sticker-matte');
const rollLine = (p, imageWidthCm, imageLengthCm, allowanceCm = 0, overrides = {}) => ({
  productId:p.id, imageWidthCm, imageLengthCm, allowanceCm, quantity:1,
  rollCalculationVersion:PRINT_ROLL_VERSION, ...overrides
});

test('FL 280 selects roll automatically, rotates oversize sides and caps the 320 cm roll charge', () => {
  const quote = (width, length, allowance) => calculateLine(banner, rollLine(banner, width, length, allowance));
  assert.deepEqual([0,6].map(allowance => quote(100, 100, allowance).rollPlacement.capacityCm), [110,220]);
  assert.deepEqual([0,5,6].map(allowance => quote(150, 150, allowance).baseTotal), [90000,90000,120000]);
  const rotated = quote(350, 100, 0);
  assert.deepEqual([rotated.rollPlacement.rotated, rotated.rollPlacement.capacityCm, rotated.baseTotal], [true,110,105000]);
  for (const allowance of [0,5]) {
    const line = quote(310, 310, allowance);
    assert.deepEqual([line.rollPlacement.capacityCm, line.billedLength, line.baseTotal, line.stockConsumption], [320,3,270000,3.5]);
  }
  assert.throws(() => quote(310, 310, 6), /maksimum 320 cm/);
  assert.throws(() => quote(350, 350, 0), /maksimum 320 cm/);
  const legacy = calculateLine(banner, rollLine(banner, 310, 310, 0, {rollCalculationVersion:1}));
  assert.equal(legacy.baseTotal, 315000);
});

test('Albatros and LF White Matte use physical capacities up to 152 cm and keep their configured A1 price', () => {
  const quote = (p, width, length) => calculateLine(p, rollLine(p, width, length));
  assert.equal(quote(albatros, 91, 200).rollPlacement.capacityCm, 91);
  assert.equal(quote(albatros, 127, 200).rollPlacement.capacityCm, 127);
  const rotated = quote(matte, 125, 100);
  assert.deepEqual([rotated.rollPlacement.capacityCm, rotated.rollPlacement.rotated], [105,true]);
  for (const p of [albatros, matte]) {
    assert.equal(quote(p, 152, 350).rollPlacement.capacityCm, 152);
    assert.equal(quote(p, 350, 152).rollPlacement.rotated, true);
    assert.throws(() => quote(p, 153, 153), /maksimum 152 cm/);
    const a1 = calculateLine(p, {sizeVariantId:'a1', quantity:2});
    assert.equal(a1.baseTotal, p.fixedSizeVariants.find(variant => variant.id === 'a1').price * 2);
    assert.equal(a1.rollPlacement, undefined);
  }
});

test('measured printing uses the image area per sheet for its own wholesale tier', () => {
  const p = {...banner, wholesaleEnabled:true, wholesaleBasis:'area', priceTiers:[{min:10, max:null, price:25000}]};
  const moreThanTier = calculateLine(p, rollLine(p, 200, 600));
  assert.deepEqual([moreThanTier.wholesaleQuantity, moreThanTier.unitPrice, moreThanTier.baseTotal], [12,25000,300000]);
  const atTier = calculateLine(p, rollLine(p, 500, 200));
  assert.deepEqual([atTier.wholesaleQuantity, atTier.unitPrice], [10,25000]);
  const each = rollLine(p, 200, 300, 10, {quantity:3});
  const {items} = calculateOrder([p], [each, {...each, quantity:2}]);
  assert.deepEqual(items.map(({wholesaleQuantity, unitPrice}) => [wholesaleQuantity,unitPrice]), [[6,30000],[6,30000]]);
  const previous = {...p, wholesaleBasis:'quantity', priceTiers:[{min:10, max:10, price:25000}]};
  assert.equal(calculateLine(previous, rollLine(previous, 200, 600)).unitPrice, 25000);
  assert.equal(calculateLine(previous, rollLine(previous, 200, 600, 0, {rollCalculationVersion:1, quantity:12})).unitPrice, 30000);
});

test('manual banner finishing is per piece and retains its rate, inputs and notes when cart lines combine', () => {
  const finishing = [
    {id:'fin-out-cut', unitsPerProduct:1},
    {id:'fin-out-seaming', unitsPerProduct:4, note:'Keempat sisi'},
    {id:'fin-out-eyelet', unitsPerProduct:4, note:'Empat sudut'}
  ];
  const input = rollLine(banner, 100, 100, 0, {finishing});
  const first = calculateLine(banner, input);
  const second = calculateLine(banner, {...input, quantity:2});
  assert.deepEqual([first.subtotal,second.subtotal], [42000,84000]);
  assert.deepEqual(second.finishing.slice(1).map(finish => [finish.unitsPerProduct, finish.units, finish.subtotal, finish.note]), [
    [4,8,20000,'Keempat sisi'], [4,8,4000,'Empat sudut']
  ]);
  const line = {...input, ...first};
  const cart = addCartLine(addCartLine([], line, banner), line, banner);
  assert.equal(cart.length, 1);
  assert.equal(calculateLine(banner, cart[0]).subtotal, second.subtotal);
  const changed = calculateLine(banner, {...input, finishing:[{id:'fin-out-seaming', unitsPerProduct:1.25}], quantity:2});
  assert.equal(changed.finishingTotal, 6250);
  assert.throws(() => calculateLine(banner, {...input, finishing:[{id:'fin-out-seaming', unitsPerProduct:-1}]}), /Jumlah finishing/);
  assert.throws(() => calculateLine(banner, {...input, finishing:[{id:'fin-out-eyelet', unitsPerProduct:1.5}]}), /Jumlah finishing/);
});

test('design configured per product is multiplied by quantity while old per-line design inputs retain their total', () => {
  const input = rollLine(banner, 100, 100, 0, {quantity:2, fileServiceId:'DESIGN_A', fileServiceQuantityPerProduct:1, fileServiceQuantity:99});
  const line = calculateLine(banner, input);
  assert.deepEqual([line.fileService.quantityPerProduct, line.fileService.quantity, line.fileServiceTotal, line.subtotal], [1,2,50000,110000]);
  const legacy = calculateLine(banner, {...input, fileServiceQuantityPerProduct:undefined, fileServiceQuantity:1});
  assert.equal(legacy.fileServiceTotal, 25000);
  const cart = addCartLine(addCartLine([], input, banner), input, banner);
  assert.equal(cart.length, 1);
  assert.equal(calculateLine(banner, cart[0]).fileServiceTotal, 100000);
  assert.equal(addCartLine(cart, {...input, fileServiceQuantityPerProduct:2}, banner).length, 2);
});

test('sheet printing and sheet finishing choose their wholesale tiers independently', () => {
  const laminate = {...paper.finishing.find(finish => finish.id === 'fin-a3-lam-matte-1'),
    price:6000, priceTiers:[{min:100, max:null, price:5000}]};
  const p = {...paper, finishing:[laminate], wholesaleEnabled:true, priceTiers:[{min:50, max:null, price:8000}]};
  const quote = quantity => calculateLine(p, {width:1, length:1, quantity, finishing:[{id:laminate.id, unitsPerProduct:7}]});
  for (const [quantity,rate,laminationRate] of [[49,10000,6000], [50,8000,6000], [100,8000,5000]]) {
    const line = quote(quantity);
    assert.deepEqual([line.unitPrice, line.finishing[0].units, line.finishing[0].unitPrice], [rate,quantity,laminationRate]);
  }
  assert.equal(calculateLine(p, {width:1, length:1, quantity:50, finishing:[{id:laminate.id, units:1}]}).finishing[0].units, 1);
});

test('Kisscut uses entered area; Master Data supports linear, area and perimeter calculations per sheet', () => {
  const kisscut = calculateLine(matte, rollLine(matte, 100, 120, 0, {quantity:2, finishing:[{id:'fin-lf-kiss', unitsPerProduct:1}]}));
  assert.deepEqual([kisscut.finishing[0].unitsPerProduct, kisscut.finishingTotal], [1.2,108000]);
  const rules = ['length','width','perimeter','area'];
  const p = {...banner, finishing:rules.map(rule => ({id:rule, name:rule, rule, price:2500, quantitySource:'size'}))};
  const quote = calculateLine(p, rollLine(p, 100, 120, 0, {quantity:2, finishing:rules.map(id => ({id, unitsPerProduct:1}))}));
  assert.deepEqual(quote.finishing.map(finish => finish.units), [2.4,2,8.8,2.4]);
});

test('finishing cards and roll details represent the actual product options', () => {
  const render = p => printFinishingSections(p, 2, String).html;
  assert.match(render(paper), /LAMINATING[\s\S]*CUTTING[\s\S]*FINISHING/);
  const finishOnly = render({...paper, finishing:paper.finishing.filter(finish => finish.type === 'FINISHING')});
  assert.match(finishOnly, /Tanpa Finishing/);
  assert.doesNotMatch(finishOnly, /Tanpa (Laminating|Cutting)/);
  const outdoor = printFinishingSections(banner, 2, String, {outdoor:true}).html;
  assert.match(outdoor, /Potong Pas Gambar<\/strong><small data-print-price hidden>/);
  assert.match(outdoor, /Lebihan Saja/);
  assert.match(outdoor, /Jumlah Seaming Lem per lembar \(m lari\)/);
  assert.equal(printFinishingSections({...banner, finishing:[]}, 2, String, {outdoor:true}).html, '');
  const modal = rollConfigurationHtml(banner, {escapeHtml:String, finishing:outdoor, files:'', designStep:3});
  assert.match(modal, /data-print-roll="1">110 cm/);
  assert.match(modal, /<summary aria-controls="roll-plan">Detail perhitungan/);
  assert.match(modal, /data-print-wholesale[\s\S]*data-roll-error/);
  assert.match(configurationActions('<input id="quantity">'), /print-action-bar[\s\S]*id="quantity"[\s\S]*id="add-item"/);
});

test('banner catalog migration links the missing default options and preserves configured selections', async () => {
  const store = new Store();
  store.memory.catalogVersion = 16;
  const p = store.memory.products.find(item => item.id === banner.id);
  p.finishingIds = p.finishingIds.filter(id => !['fin-out-extra','fin-out-seaming'].includes(id));
  assert.deepEqual((await store.read()).products.find(item => item.id === p.id).finishingIds, banner.finishingIds);
  p.finishingIds = ['fin-out-eyelet'];
  assert.deepEqual((await store.read()).products.find(item => item.id === p.id).finishingIds, ['fin-out-eyelet']);
});

test('the POS API persists per-piece finish quantities through Master Data updates, drafts and edits', async () => {
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const child = spawn(process.execPath, ['server.js'], {
    cwd:new URL('..', import.meta.url).pathname,
    env:{...process.env, DATABASE_URL:'', NODE_ENV:'test', APP_PIN:'1234', PORT:String(port)},
    stdio:'ignore'
  });
  const stopped = once(child, 'exit');
  const base = `http://127.0.0.1:${port}`;
  const json = data => ({method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(data)});
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100 && !ready; attempt++) {
      ready = await fetch(`${base}/api/health`).then(response => response.ok, () => false);
      if (!ready) await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert(ready);
    const login = await fetch(`${base}/api/login`, json({username:'admin', pin:'1234'}));
    assert(login.ok);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const request = async (path, method = 'GET', data) => {
      const response = await fetch(base + path, {method, headers:{cookie, 'content-type':'application/json'}, body:JSON.stringify(data)});
      const body = await response.json();
      assert(response.ok, JSON.stringify(body));
      return body;
    };
    const id = 'fin-out-seaming';
    const original = catalog.finishings.find(finish => finish.id === id);
    const changed = await request(`/api/finishings/${id}`, 'PUT', {...original, quantitySource:'manual'});
    assert.equal(changed.quantitySource, 'manual');
    const input = rollLine(banner, 100, 100, 0, {finishing:[{id, unitsPerProduct:4}, {id:'fin-out-eyelet', unitsPerProduct:4}]});
    const body = {customerName:'Uji cetak', phone:'4312', items:[input]};
    const quote = await request('/api/orders/check', 'POST', {items:[input], includeItems:true});
    assert.equal(quote.total, 42000);
    const order = await request('/api/orders', 'POST', body);
    assert.equal(order.total, 42000);
    const [item] = order.items;
    assert.equal(item.rollCalculationVersion, PRINT_ROLL_VERSION);
    const updated = await request(`/api/orders/${order.id}`, 'PUT', {...body, items:[{...item, quantity:2}]});
    assert.equal(updated.total, 84000);
    assert.deepEqual(updated.items[0].finishing.map(finish => finish.unitsPerProduct), [4,4]);
    const paid = await request(`/api/orders/${order.id}/payments`, 'POST', {method:'TUNAI', amount:1, requestId:'test-print-payment'});
    assert.equal(paid.total, updated.total);
    const repeated = await request(`/api/orders/${order.id}/repeat`, 'POST', {});
    assert.equal(repeated.total, updated.total);
  } finally {
    child.kill();
    await stopped;
  }
});
