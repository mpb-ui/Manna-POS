import { createHash, randomUUID } from "node:crypto";
import { adjustPhysicalStock } from "./physical-stock.js";
import { MATERIAL_SCAN_ID, MAX_SCAN_ITEMS } from "../public/stock-scan-rules.js";

const fingerprint = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const revision = /^[a-f0-9]{64}$/;
const scanSources = ["BARCODE", "CORRECTION"];
const validQuantity = value => Number.isSafeInteger(value) && value > 0;
export const scanError = (status, code, message, details) => Object.assign(new Error(message), { status, code, details });

function inspectMaterial(material, stock) {
  if (!material) return "Barcode bahan tidak dikenal.";
  if (material.deletedAt || material.archivedAt || material.active === false) return "Bahan ini sudah diarsipkan atau tidak aktif.";
  if (material.stockMethod !== "ROLL" || stock && stock.stockMethod !== "ROLL") return "Barcode hanya berlaku untuk bahan Per Roll.";
  if (!stock || material.stockNeedsCount || stock.stockNeedsCount || stock.unit !== "roll" || !Number.isSafeInteger(stock.quantity) || stock.quantity < 0) {
    return "Tetapkan saldo fisik roll melalui Stok Opname terlebih dahulu.";
  }
  if (!MATERIAL_SCAN_ID.test(material.id) || !Number.isFinite(material.rollWidthCm) || material.rollWidthCm <= 0 || stock.rollWidthCm !== material.rollWidthCm || stock.sku !== material.sku) {
    return "Periksa identitas SKU dan lebar roll di Master Data Bahan.";
  }
  return null;
}

function snapshot({ id, sku, name, category, rollWidthCm }, stock) {
  const row = { materialId: id, sku, name, category: category || "Lainnya", rollWidthCm, balance: stock.quantity };
  return { ...row, version: fingerprint([row, stock.updatedAt]) };
}

export function stockScanCatalog({ materials, inventory }) {
  const byMaterial = new Map();
  for (const row of inventory) {
    if (row.materialId) byMaterial.set(row.materialId, byMaterial.has(row.materialId) ? null : row);
  }
  const seen = new Set();
  const duplicates = new Set();
  for (const { id } of materials) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return materials.flatMap(material => {
    const stock = byMaterial.get(material.id);
    return duplicates.has(material.id) || inspectMaterial(material, stock) ? [] : [snapshot(material, stock)];
  }).sort((a, b) => a.category.localeCompare(b.category, "id") || a.name.localeCompare(b.name, "id", { numeric: true }) || a.rollWidthCm - b.rollWidthCm || a.sku.localeCompare(b.sku, "id"));
}

function findMaterial(state, materialId) {
  const [material, duplicateMaterial] = state.materials.filter(row => row.id === materialId);
  const [stock, duplicateStock] = state.inventory.filter(row => row.materialId === materialId);
  const error = duplicateMaterial || duplicateStock
    ? "ID bahan memiliki lebih dari satu catatan. Hubungi Owner untuk memeriksa Master Data."
    : inspectMaterial(material, stock);
  return { material, stock, error, current: error ? null : snapshot(material, stock) };
}

export function scanMaterial(state, materialId) {
  const { material, error, current } = findMaterial(state, materialId);
  if (error) throw scanError(material ? 409 : 404, "SCAN_MATERIAL", error);
  return current;
}

function scanNote(value, required = false) {
  const note = typeof value === "string" ? value.trim() : "";
  if (value !== undefined && typeof value !== "string" || note.length > 250 || required && !note) {
    throw scanError(400, "SCAN_INPUT", required ? "Isi alasan koreksi, maksimal 250 karakter." : "Catatan maksimal 250 karakter.");
  }
  return note;
}

export function parseScanCommit(body) {
  const { requestId, direction, items, note } = body || {};
  if (typeof requestId !== "string" || !uuid.test(requestId) || !["IN", "OUT"].includes(direction) || !Array.isArray(items) || items.length < 1 || items.length > MAX_SCAN_ITEMS) {
    throw scanError(400, "SCAN_INPUT", "Pilih mode dan masukkan 1–50 jenis bahan.");
  }
  const used = new Set();
  const entries = items.map(item => {
    const { materialId, quantity, version } = item || {};
    if (typeof materialId !== "string" || !MATERIAL_SCAN_ID.test(materialId) || used.has(materialId) || !validQuantity(quantity) || typeof version !== "string" || !revision.test(version)) {
      throw scanError(400, "SCAN_INPUT", "Identitas bahan atau jumlah roll tidak valid. Jumlah harus berupa bilangan bulat positif.");
    }
    used.add(materialId);
    return { materialId, quantity, version };
  }).sort((a, b) => a.materialId.localeCompare(b.materialId));
  if (!Number.isSafeInteger(entries.reduce((sum, item) => sum + item.quantity, 0))) throw scanError(400, "SCAN_INPUT", "Total roll melebihi batas penyimpanan.");
  return { requestId, direction, items: entries, note: scanNote(note) };
}

export function parseScanCorrection(body, movementId) {
  const { requestId, quantity, version, reason, physicalConfirmed } = body || {};
  if (typeof requestId !== "string" || !uuid.test(requestId) || !validQuantity(quantity) || typeof version !== "string" || !revision.test(version) || physicalConfirmed !== true) {
    throw scanError(400, "SCAN_INPUT", "Isi jumlah bulat dan konfirmasi bahwa kondisi fisik stok sudah diperiksa.");
  }
  return { requestId, movementId, quantity, version, reason: scanNote(reason, true) };
}

export function scanMovementView(move) {
  const { id, groupId, materialId, productName, sku, rollWidthCm, change, balance, balanceVersion, previousBalance, unit, direction, source, reason, note, createdAt, reversalOf, actor } = move;
  return { id, groupId, materialId, productName, sku, rollWidthCm, change, balance, balanceVersion, previousBalance, unit, direction, source, reason, note, createdAt, reversalOf, actor };
}

function receipt(movements, replayed) {
  const { groupId, requestId, direction } = movements[0];
  return { groupId, requestId, direction, movements: movements.map(scanMovementView).sort((a, b) => a.materialId.localeCompare(b.materialId)), replayed };
}

function previousReceipt(state, requestId, digest, actor) {
  const previous = state.stockMovements.find(move => scanSources.includes(move.source) && move.requestId === requestId);
  if (!previous) return null;
  if (previous.actorId !== actor.id || previous.requestFingerprint !== digest) {
    throw scanError(409, "SCAN_REQUEST_REUSED", "ID transaksi sudah digunakan. Muat ulang untuk memeriksa transaksi sebelumnya.");
  }
  return receipt(state.stockMovements.filter(move => move.groupId === previous.groupId && scanSources.includes(move.source)), true);
}

function recordMovement(state, details, change, context) {
  const { material, stock, current } = details;
  const { reason, actor, timestamp } = context;
  const { movement } = adjustPhysicalStock(state, stock, { change, reason }, actor.name, timestamp);
  material.stock = stock.quantity;
  Object.assign(movement, {
    type: context.source === "CORRECTION" ? "BARCODE_CORRECTION" : change > 0 ? "SCAN_IN" : "SCAN_OUT",
    source: context.source,
    direction: change > 0 ? "IN" : "OUT",
    groupId: context.groupId,
    requestId: context.requestId,
    requestFingerprint: context.digest,
    materialId: current.materialId,
    productName: current.name,
    rollWidthCm: current.rollWidthCm,
    previousBalance: current.balance,
    balanceVersion: snapshot(material, stock).version,
    actorId: actor.id,
    note: context.note || null,
    reversalOf: context.reversalOf || null,
    physicalConfirmed: context.source === "CORRECTION"
  });
  return movement;
}

function balanceError(current, newBalance) {
  if (newBalance < 0) return `Stok ${current.name} tersedia ${current.balance} roll.`;
  if (!Number.isSafeInteger(newBalance)) return "Saldo roll melebihi batas penyimpanan.";
  return null;
}

export function commitStockScan(state, { requestId, direction, items, note }, actor, timestamp, audit) {
  const digest = fingerprint(["scan", direction, items, note]);
  const previous = previousReceipt(state, requestId, digest, actor);
  if (previous) return previous;
  const sign = direction === "OUT" ? -1 : 1;
  const validated = items.map(item => {
    const details = findMaterial(state, item.materialId);
    const { current } = details;
    const issue = details.error || balanceError(current, current.balance + sign * item.quantity)
      || (item.version !== current.version ? "Saldo atau informasi bahan berubah. Periksa kembali sebelum konfirmasi." : null);
    return { ...details, item, issue };
  });
  if (validated.some(result => result.issue)) {
    const materials = validated.map(({ item, current, issue }) => ({ materialId: item.materialId, current, issue }));
    throw scanError(409, "SCAN_REVIEW_CHANGED", validated.find(result => result.issue).issue, { materials });
  }
  const context = { source: "BARCODE", groupId: randomUUID(), requestId, digest, actor, timestamp, note, reason: direction === "OUT" ? "Buka Roll Baru" : "Penerimaan Bahan" };
  const movements = validated.map(details => recordMovement(state, details, sign * details.item.quantity, context));
  audit(state, actor, `STOCK_SCAN_${direction}`, context.reason, { groupId: context.groupId, requestId, movementIds: movements.map(move => move.id) });
  return receipt(movements, false);
}

export function scanCorrectionDetails(state, movementId) {
  const original = state.stockMovements.find(move => move.id === movementId && move.source === "BARCODE");
  if (!original) throw scanError(404, "SCAN_ORIGINAL_MISSING", "Mutasi barcode asal tidak ditemukan.");
  const { current, error } = findMaterial(state, original.materialId);
  const existing = state.stockMovements.find(move => move.source === "CORRECTION" && move.reversalOf === original.id);
  const issue = existing ? "Mutasi ini sudah dikoreksi."
    : error || (current.rollWidthCm !== original.rollWidthCm || original.stockMethod !== "ROLL" || original.unit !== "roll"
      ? "Identitas fisik roll sudah berubah. Periksa saldo melalui Stok Opname." : null);
  return { original: scanMovementView(original), current, correction: existing ? scanMovementView(existing) : null, issue };
}

export function correctStockScan(state, { requestId, movementId, quantity, version, reason }, actor, timestamp, audit) {
  const digest = fingerprint(["correction", movementId, quantity, version, reason]);
  const previous = previousReceipt(state, requestId, digest, actor);
  if (previous) return previous;
  const { original, current, issue } = scanCorrectionDetails(state, movementId);
  if (issue) throw scanError(409, "SCAN_CORRECTION_REVIEW", issue);
  const change = original.change > 0 ? -quantity : quantity;
  if (quantity > Math.abs(original.change)) throw scanError(400, "SCAN_INPUT", "Jumlah koreksi melebihi jumlah mutasi asal.");
  if (current.version !== version || balanceError(current, current.balance + change)) {
    throw scanError(409, "SCAN_CORRECTION_REVIEW", balanceError(current, current.balance + change) || "Saldo bahan berubah. Periksa kembali sebelum konfirmasi.");
  }
  const context = { source: "CORRECTION", groupId: randomUUID(), requestId, digest, actor, timestamp, reason, reversalOf: original.id };
  const movement = recordMovement(state, findMaterial(state, original.materialId), change, context);
  audit(state, actor, "STOCK_SCAN_CORRECTION", reason, { groupId: context.groupId, requestId, movementId: movement.id, reversalOf: original.id });
  return receipt([movement], false);
}
