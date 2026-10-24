import crypto from 'node:crypto';
import { returnableRetailItem } from '../public/goods-return-rules.js';
import { normalizedStockUnit } from '../public/stock-methods.js';
import { stockSources } from './physical-stock.js';
import { invoiceCode } from './invoice-numbers.js';

export function initializeGoodsReturns(state) {
  state.goodsReturns ||= [];
  state.nextGoodsReturnNumber ||= state.goodsReturns.length + 1;
}
const fail = message => { throw Object.assign(new Error(message), { status: 409 }); };
const rounded = n => Number(n.toFixed(4));
function sourcesFor(state, item) {
  const sources = stockSources(item).filter(source => Number(source.units) > 0).map(source => {
    const row = state.inventory.find(row => source.materialId ? row.materialId === source.materialId : source.productId ? row.productId === source.productId : row.sku === source.sku);
    if (!row || row.stockMethod !== 'UNIT' || row.stockNeedsCount || !Number.isFinite(Number(row.quantity)) || !Number.isFinite(Number(source.units)) || source.unit && normalizedStockUnit(source.unit) !== normalizedStockUnit(row.unit)) fail(`Stok ${item.productName} belum siap untuk penukaran; periksa SKU dan satuan`);
    const material = state.materials.find(material => material.id === row.materialId || material.sku === row.sku);
    const product = state.products.find(product => product.id === row.productId);
    const unitCost = Number(material?.cost ?? product?.baseCost ?? source.unitCost ?? 0);
    if (!Number.isFinite(unitCost) || unitCost < 0) fail('Biaya barang pengganti tidak valid');
    return { row, unitsPerItem: Number(source.units) / Number(item.quantity), unitCost };
  });
  if (!sources.length) fail(`SKU stok ${item.productName} tidak ditemukan`);
  return sources;
}
function availableSources(state, order) {
  const records = (state.goodsReturns || []).filter(record => record.orderId === order.id);
  const used = new Map();
  for (const record of records) for (const line of record.lines) {
    const key = line.parentLineId || `original:${line.itemId}`;
    used.set(key, (used.get(key) || 0) + line.quantity);
  }
  const options = [];
  const add = (item, quantity, parentLineId, sourceCode) => {
    const key = parentLineId || `original:${item.itemId}`;
    const remaining = quantity - (used.get(key) || 0);
    if (remaining <= 0) return;
    let stockQuantity = 0, stockError = '', sku = '';
    try {
      const sources = sourcesFor(state, item), required = new Map();
      for (const source of sources) required.set(source.row.sku, { row: source.row, units: (required.get(source.row.sku)?.units || 0) + source.unitsPerItem });
      stockQuantity = Math.max(0, Math.min(...[...required.values()].map(s => Math.floor((Number(s.row.quantity) + .00001) / s.units))));
      sku = sources.map(s => s.row.sku).join(' / ');
    } catch (error) { stockError = error.message; }
    options.push({ key, itemId: item.itemId, parentLineId, sourceCode, productName: item.productName, specification: item.displaySize || '', unitName: item.unitName || item.saleUnit || 'pcs', sku, remaining, stockQuantity, maxQuantity: Math.min(remaining, stockQuantity), stockError });
  };
  for (const item of order.items || []) if (returnableRetailItem(order, item)) {
    add(item, Number(item.quantity), null, 'Pembelian awal');
    for (const record of records) for (const line of record.lines) if (line.itemId === item.itemId) add(item, line.quantity, line.id, record.code);
  }
  return options;
}
export function goodsReturnOptions(state, order) { return availableSources(state, order); }
export function publicGoodsReturn(record, showCost = false) {
  return { id: record.id, code: record.code, orderId: record.orderId, invoice: record.invoice, customerName: record.customerName, createdAt: record.createdAt, actor: record.actor, note: record.note,
    lines: record.lines.map(line => ({ id: line.id, itemId: line.itemId, parentLineId: line.parentLineId, sourceCode: line.sourceCode, productName: line.productName, sku: line.sku, quantity: line.quantity, unitName: line.unitName, ...(showCost ? { cost: line.cost } : {}) })), ...(showCost ? { cost: record.cost } : {}) };
}
export function exchangeDefectiveGoods(state, order, body, user, timestamp = new Date().toISOString()) {
  initializeGoodsReturns(state);
  if (typeof body.requestId !== 'string' || !body.requestId.trim() || body.requestId.length > 150) fail('Identitas retur wajib diisi');
  if (body.reason !== 'DEFECT' || body.defectReceived !== true || body.replacementDelivered !== true) fail('Konfirmasi barang defect telah diterima dan barang pengganti telah diserahkan');
  const note = String(body.note || '').trim();
  if (!note || note.length > 1000) fail('Isi catatan kerusakan maksimal 1.000 karakter');
  if (!Array.isArray(body.lines) || !body.lines.length || body.lines.length > 100) fail('Pilih barang dan jumlah yang akan ditukar');
  const input = body.lines.map(line => ({ itemId: String(line.itemId || ''), parentLineId: line.parentLineId || null, quantity: Number(line.quantity) })).sort((a,b) => `${a.itemId}|${a.parentLineId}`.localeCompare(`${b.itemId}|${b.parentLineId}`));
  const fingerprint = JSON.stringify({ orderId: order.id, actorId: user.id, note, lines: input });
  const previous = state.goodsReturns.find(record => record.requestId === body.requestId);
  if (previous) { if (previous.fingerprint !== fingerprint) fail('Identitas retur sudah digunakan untuk data berbeda'); return { record: previous, replayed: true }; }
  const options = new Map(availableSources(state, order).map(option => [option.key, option]));
  const seen = new Set(), demand = new Map(), lines = [];
  for (const entry of input) {
    const key = entry.parentLineId || `original:${entry.itemId}`, option = options.get(key);
    if (seen.has(key) || !option || option.itemId !== entry.itemId || !Number.isSafeInteger(entry.quantity) || entry.quantity <= 0 || entry.quantity > option.remaining) fail('Jumlah retur melebihi sisa barang yang dapat ditukar');
    seen.add(key);
    if (entry.quantity > option.maxQuantity || option.stockError) fail(option.stockError || `Stok pengganti ${option.productName} tidak mencukupi`);
    const item = order.items.find(item => item.itemId === entry.itemId);
    let cost = 0; const movements = [];
    for (const source of sourcesFor(state, item)) {
      const units = rounded(source.unitsPerItem * entry.quantity);
      demand.set(source.row.sku, { row: source.row, units: rounded((demand.get(source.row.sku)?.units || 0) + units) });
      cost += units * source.unitCost;
      movements.push({ sku: source.row.sku, materialId: source.row.materialId || null, productId: source.row.productId || null, productName: source.row.productName, unit: source.row.unit, units, unitCost: source.unitCost });
    }
    lines.push({ id: crypto.randomUUID(), itemId: item.itemId, productId: item.productId, productName: item.productName, category: state.products.find(p => p.id === item.productId)?.category || item.category || '', sku: option.sku, unitName: option.unitName, quantity: entry.quantity, parentLineId: entry.parentLineId, sourceCode: option.sourceCode, cost: Math.round(cost), movements });
  }
  for (const { row, units } of demand.values()) if (units > Number(row.quantity)) fail(`Stok pengganti ${row.productName} tidak mencukupi`);
  const record = { id: crypto.randomUUID(), code: invoiceCode(state.nextGoodsReturnNumber++, timestamp).replace('INV-', 'RET-'), requestId: body.requestId, fingerprint, orderId: order.id, invoice: order.code, customerName: order.customerName, actor: user.name, actorId: user.id, createdAt: timestamp, reason: 'DEFECT', note, defectReceived: true, replacementDelivered: true, lines, cost: lines.reduce((sum,line) => sum + line.cost, 0) };
  for (const line of lines) for (const source of line.movements) {
    const row = demand.get(source.sku).row;
    row.quantity = rounded(Number(row.quantity) - source.units); row.updatedAt = timestamp;
    state.stockMovements.unshift({ id: crypto.randomUUID(), type: 'DEFECT_EXCHANGE', phase: 'SALE', sku: row.sku, productId: source.productId, materialId: source.materialId, productName: source.productName, unit: row.unit, change: -source.units, balance: row.quantity, orderId: order.id, itemId: line.itemId, orderCode: order.code, goodsReturnId: record.id, goodsReturnCode: record.code, returnLineId: line.id, actor: user.name, actorId: user.id, reason: 'Barang pengganti untuk retur defect', createdAt: timestamp, recordedAt: timestamp });
  }
  state.goodsReturns.push(record);
  order.updatedAt = timestamp;
  return { record, replayed: false };
}
