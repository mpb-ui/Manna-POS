import crypto from "node:crypto";
import { defaultStockMethod, normalizedStockUnit } from "../public/stock-methods.js";
import { finishedItem, refreshOrderWorkflow } from "../public/item-workflow.js";
import { cancelled } from "../public/order-rules.js";

export const STOCK_SCHEMA_VERSION = 1;
const round = value => Number(Number(value).toFixed(4));
const at = () => new Date().toISOString();

// No quantity conversion: old area/length balances remain visible until an
// explicit physical count establishes a roll balance for that SKU.
export function initializeStockState(state) {
  state.materials ||= []; state.inventory ||= []; state.stockMovements ||= [];
  const byId = new Map(state.inventory.filter(row => row.materialId).map(row => [row.materialId, row]));
  for (const material of state.materials) {
    material.stockMethod ??= defaultStockMethod(material);
    material.stockUnit ??= material.stockMethod === "ROLL" ? "roll" : material.unit;
    material.stockNeedsCount ??= material.stockMethod === "ROLL" && normalizedStockUnit(material.unit) !== "roll";
    const row = byId.get(material.id);
    if (row) Object.assign(row, { stockMethod: material.stockMethod, stockUnit: material.stockUnit, stockNeedsCount: material.stockNeedsCount, rollWidthCm: material.rollWidthCm || null, unit: material.stockNeedsCount ? row.unit : material.stockUnit });
  }
  const bySku = new Map(state.inventory.map(row => [row.sku, row]));
  for (const move of state.stockMovements) move.unit ??= bySku.get(move.sku)?.unit || "satuan lama";
  const byProduct = new Map(state.inventory.filter(row => row.productId).map(row => [row.productId, row]));
  for (const product of state.products || []) {
    if (!product.retailAtK || product.deletedAt || product.materialSources?.length || product.hasMaterialVariants) continue;
    let row = byProduct.get(product.id) || bySku.get(product.sku) || bySku.get(`${product.id}-unit`);
    if (row?.materialId || row?.productId && row.productId !== product.id) continue;
    if (!row) {
      if (!product.sku || bySku.has(product.sku)) continue;
      row = { sku: product.sku, productId: product.id, productName: product.name, category: product.category, quantity: 0, minStock: 0, unit: product.saleUnit || product.unitName || "pcs", updatedAt: at() };
      state.inventory.push(row); bySku.set(row.sku, row);
    }
    // Inventory is linked directly to the retail product, not a duplicate Bahan.
    Object.assign(row, { productId: product.id, productName: product.name, category: product.category, stockMethod: "UNIT", stockUnit: row.unit, stockNeedsCount: false });
    product.retailStockSku = row.sku;
  }
  const products = new Map((state.products || []).map(product => [product.id, product]));
  const legacyMigration = state.stockSchemaVersion !== STOCK_SCHEMA_VERSION;
  for (const order of state.orders || []) {
    if (legacyMigration && !Object.hasOwn(order,"stockCommitted") && ["SELESAI","DIAMBIL"].includes(order.status)) { order.stockCommitted = true; order.stockCommitBasis = "LEGACY_CLOSED_SKIP"; }
    for (const item of order.items || []) {
      item.stockCommitted ??= Boolean(order.stockCommitted);
      // Existing unpaid/draft orders may use the new sale rule. Existing paid
      // orders keep their historic production workflow, never deduct on read.
      const product = products.get(item.productId);
      item.stockTiming ??= !order.paymentConfirmed && product?.retailAtK ? "SALE" : "PRODUCTION";
      if (product?.retailStockSku) item.retailStockSku ??= product.retailStockSku;
    }
  }
  state.stockSchemaVersion = STOCK_SCHEMA_VERSION;
  return state;
}

export function stockSources(item) {
  if (item.materials?.length) return item.materials;
  return item.retailStockSku ? [{ sku: item.retailStockSku, productId: item.productId, units: item.quantity, unit: item.unitName }]
    : item.stockSku ? [{ sku: item.stockSku, units: item.stockConsumption }] : [];
}

export function commitPhysicalStock(state, order, { phase = "PRODUCTION", actor = "Sistem", timestamp = at() } = {}) {
  if (cancelled(order)) return;
  const selected = order.items.filter(item => !item.stockCommitted && (phase === "SALE" ? item.stockTiming === "SALE" : item.stockTiming !== "SALE"));
  if (!selected.length) return;
  if (phase === "PRODUCTION" && !order.items.every(finishedItem)) return;
  const bySku = new Map(state.inventory.map(row => [row.sku, row]));
  const byProduct = new Map(state.inventory.filter(row => row.productId).map(row => [row.productId,row]));
  const byMaterial = new Map(state.inventory.filter(row => row.materialId).map(row => [row.materialId, row]));
  for (const item of selected) {
    if (phase === "SALE" && !item.retailStockSku && !item.materials?.length) throw new Error("Barang dagangan belum terhubung ke stok fisik");
    for (const source of stockSources(item)) {
      const row = source.materialId ? byMaterial.get(source.materialId) : source.productId ? byProduct.get(source.productId) : bySku.get(source.sku);
      if (!row && phase === "SALE") throw new Error("Stok barang dagangan tidak ditemukan; periksa hubungan SKU sebelum transaksi");
      if (!row || row.stockMethod === "ROLL") continue;
      const units = Number(source.units || 0);
      if (!Number.isFinite(units) || units < 0) throw new Error("Jumlah pemakaian stok tidak valid");
      if (!units) continue;
      if (row.stockNeedsCount) throw new Error(`Tetapkan saldo awal ${row.productName} melalui stok opname dahulu`);
      if (source.unit && normalizedStockUnit(source.unit) !== normalizedStockUnit(row.unit)) throw new Error(`Satuan konsumsi ${source.unit} tidak cocok dengan stok ${row.unit} untuk ${row.productName}`);
      row.quantity = round(Number(row.quantity) - units); row.updatedAt = timestamp;
      state.stockMovements.unshift({ id: crypto.randomUUID(), type: "AUTO_USE", sku: row.sku, materialId: row.materialId || null, productId: row.productId || null, productName: row.productName, unit: row.unit, change: -units, balance: row.quantity, orderId: order.id, itemId: item.itemId, orderCode: order.code, phase, actor, reason: phase === "SALE" ? "Penjualan barang dagangan dikonfirmasi" : "Pemakaian produksi selesai", createdAt: timestamp, recordedAt: timestamp });
    }
    item.stockCommitted = true; item.stockCommittedAt = timestamp;
  }
  order.stockCommitted = order.items.every(item => item.stockCommitted);
}

export function confirmRetailStock(state, order, actor, timestamp) {
  if (cancelled(order)) return;
  commitPhysicalStock(state, order, { phase: "SALE", actor, timestamp });
  for (const item of order.items) if (item.stockTiming === "SALE" && !finishedItem(item)) {
    item.status = "SELESAI"; item.statusEnteredAt = timestamp; item.updatedAt = timestamp;
  }
  if (order.status !== "DIAMBIL" && order.items.every(item => item.stockTiming === "SALE") && order.paidAmount >= order.total) {
    order.items.forEach(item => { item.status = "DIAMBIL"; }); order.pickedUpAt = timestamp;
  }
  refreshOrderWorkflow(order, timestamp);
}

export function updateStockMethod(state, material, body, actor, timestamp = at()) {
  const method = body.stockMethod ?? material.stockMethod ?? defaultStockMethod(material);
  if (!["ROLL", "UNIT"].includes(method)) throw new Error("Metode pencatatan stok tidak valid");
  const width = Number(body.rollWidthCm ?? material.rollWidthCm ?? 0);
  if (method === "ROLL" && (!state.inventory.some(row=>row.materialId===material.id) || body.confirmStockCount === true) && (!Number.isFinite(width) || width <= 0)) throw new Error("Isi lebar roll (cm) untuk identitas SKU fisik");
  const unit = method === "ROLL" ? "roll" : String(body.stockUnit || (material.stockMethod === "UNIT" ? material.stockUnit : material.unit) || material.unit).trim();
  if (!unit || method === "UNIT" && normalizedStockUnit(unit) !== normalizedStockUnit(material.unit)) throw new Error("Satuan stok Per Satuan harus sesuai satuan konsumsi bahan");
  const stock = state.inventory.find(row => row.materialId === material.id);
  if (stock && material.stockNeedsCount && method === material.stockMethod && unit === material.stockUnit && body.confirmStockCount !== true) return;
  const changed = method !== material.stockMethod || normalizedStockUnit(unit) !== normalizedStockUnit(stock?.unit || material.unit) || material.stockNeedsCount;
  if (stock && changed) {
    const balance = Number(body.stockOpeningBalance);
    if (body.confirmStockCount !== true || !Number.isFinite(balance) || balance < 0 || method === "ROLL" && !Number.isInteger(balance) || !String(body.stockCountReason || "").trim()) throw new Error("Perubahan metode/satuan memerlukan stok opname, saldo awal dan alasan yang jelas");
    const previousBalance = stock.quantity, previousUnit = stock.unit, previousMethod = material.stockMethod;
    stock.quantity = balance; stock.updatedAt = timestamp;
    state.stockMovements.unshift({ id: crypto.randomUUID(), type: "METHOD_OPENING", sku: stock.sku, materialId: material.id, productName: material.name, change: 0, balance, unit, previousBalance, previousUnit, previousMethod, stockMethod: method, actor, reason: body.stockCountReason.trim(), createdAt: timestamp, recordedAt: timestamp });
    material.stock = balance;
  }
  Object.assign(material, { stockMethod: method, stockUnit: unit, stockNeedsCount: false, rollWidthCm: method === "ROLL" ? width || null : null });
  if (stock) Object.assign(stock, { stockMethod: method, stockUnit: unit, stockNeedsCount: false, rollWidthCm: material.rollWidthCm, unit });
}

export function adjustPhysicalStock(state, stock, body, actor, timestamp = at()) {
  if (body.requestId) {
    const previous = state.stockMovements.find(move => move.requestId === body.requestId);
    if (previous) {
      if (previous.sku !== stock.sku || previous.change !== Number(body.change) || (previous.reversalOf || null) !== (body.reversalOf || null)) throw new Error("Permintaan stok sudah digunakan untuk perubahan berbeda");
      return { stock, movement: previous, replayed: true };
    }
  }
  const change = Number(body.change);
  if (!Number.isFinite(change) || !change || stock.stockMethod === "ROLL" && !Number.isInteger(change)) throw new Error("Jumlah penyesuaian tidak valid; pengeluaran roll harus roll utuh");
  if (stock.stockNeedsCount) throw new Error("Saldo lama belum berupa roll. Tetapkan saldo awal melalui Edit Bahan / stok opname");
  if (stock.stockMethod === "ROLL" && Number(stock.quantity) + change < 0) throw new Error("Jumlah roll tidak mencukupi");
  const reason = String(body.reason || "").trim();
  if (!reason) throw new Error("Alasan mutasi stok wajib diisi");
  if (body.reversalOf) {
    const original = state.stockMovements.find(move => move.id === body.reversalOf && (move.sku === stock.sku || move.productId && move.productId === stock.productId || move.materialId && move.materialId === stock.materialId) && move.type === "AUTO_USE");
    const returned = state.stockMovements.filter(move => move.reversalOf === body.reversalOf).reduce((sum, move) => sum + Number(move.change), 0);
    if (!original || change <= 0 || change > -original.change - returned || body.physicalReturned !== true || original.unit !== stock.unit) throw new Error("Retur harus sesuai mutasi asal dan barang yang benar-benar telah kembali secara fisik");
  }
  const date = String(body.movementDate || "");
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00+08:00`)))) throw new Error("Tanggal stok tidak valid");
  stock.quantity = round(Number(stock.quantity) + change); stock.updatedAt = timestamp;
  const movement = { id: crypto.randomUUID(), type: body.reversalOf ? "PHYSICAL_RETURN" : "MANUAL", requestId: body.requestId || null, reversalOf: body.reversalOf || null, physicalReturned: body.physicalReturned === true, sku: stock.sku, productName: stock.productName, category: stock.category || "", change, balance: stock.quantity, unit: stock.unit, stockMethod: stock.stockMethod || "UNIT", orderCode: null, actor, reason, movementDate: date || null, createdAt: date ? new Date(`${date}T12:00:00+08:00`).toISOString() : timestamp, recordedAt: timestamp };
  state.stockMovements.unshift(movement);
  return { stock, movement };
}

export function syncRetailProductStock(state, product, previousSku) {
  if (product.retailAtK && !product.materialSources?.length && !product.hasMaterialVariants && state.inventory.some(row => row.sku === product.sku && (row.materialId || row.productId && row.productId !== product.id))) throw new Error("SKU stok sudah digunakan bahan atau barang lain");
  const stock = state.inventory.find(row => row.productId === product.id);
  if (stock && product.retailAtK) {
    const unit = product.saleUnit || product.unitName || "pcs";
    if (normalizedStockUnit(unit) !== normalizedStockUnit(stock.unit)) {
      if (Number(stock.quantity)) throw new Error("Satuan jual tidak dapat diubah ketika masih memiliki saldo stok");
      stock.unit = unit; stock.stockUnit = unit;
    }
    if (previousSku && previousSku !== product.sku) {
      if (state.inventory.some(row=>row!==stock && row.sku===product.sku)) throw new Error("SKU stok sudah digunakan");
      stock.sku = product.sku;
    }
  }
  initializeStockState(state);
}
