import { MAX_SCAN_ITEMS, scanModeLabel } from "./stock-scan-rules.js";

export function scanDraft() {
  return { phase: "IDLE", direction: null, activeId: null, items: new Map() };
}

export function resetScan(draft, phase = "IDLE") {
  Object.assign(draft, scanDraft(), { phase });
}

export const acceptsScan = draft => ["IDLE", "SCANNING", "SUCCESS"].includes(draft.phase);
export const stockAfterScan = (direction, item) => item.balance + (direction === "OUT" ? -item.quantity : item.quantity);
export const deliberateClick = event => event.isTrusted && event.detail > 0;

export function selectScanMode(draft, direction) {
  if (!acceptsScan(draft)) return;
  if (draft.items.size && draft.direction !== direction) {
    throw new Error(`Draft ${scanModeLabel(draft.direction)} masih berisi bahan. Batalkan draft sebelum mengganti mode.`);
  }
  draft.direction = direction;
  draft.phase = "SCANNING";
}

export function stageScannedMaterial(draft, material) {
  if (!acceptsScan(draft)) return;
  if (!draft.direction) throw new Error("Pilih atau scan Stok Masuk / Keluar terlebih dahulu.");
  const current = draft.items.get(material.materialId);
  if (!current && draft.items.size >= MAX_SCAN_ITEMS) throw new Error("Satu transaksi dapat memuat maksimal 50 jenis bahan.");
  draft.items.set(material.materialId, { ...material, quantity: current?.quantity ?? 1, invalidQuantity: current?.invalidQuantity });
  draft.activeId = material.materialId;
  draft.phase = "SCANNING";
}

export function setScanQuantity(draft, id, quantity) {
  if (!acceptsScan(draft)) return;
  const item = draft.items.get(id);
  if (!item) throw new Error("Scan barcode bahan sebelum memilih jumlah roll.");
  if (!Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("Jumlah roll harus berupa bilangan bulat positif.");
  item.quantity = quantity;
  delete item.invalidQuantity;
  draft.activeId = id;
}

export function scanProblem(draft) {
  for (const item of draft.items.values()) {
    if (item.unavailable) return item.unavailable;
    if (item.invalidQuantity !== undefined) return "Periksa kembali jumlah roll yang belum valid.";
    const after = stockAfterScan(draft.direction, item);
    if (after < 0) return `Stok ${item.name} tersedia ${item.balance} roll. Kurangi jumlah yang keluar.`;
    if (!Number.isSafeInteger(after)) return "Saldo roll melebihi batas penyimpanan.";
  }
  if (!Number.isSafeInteger([...draft.items.values()].reduce((sum, item) => sum + item.quantity, 0))) return "Total roll melebihi batas penyimpanan.";
  return "";
}

export function reviewScan(draft) {
  if (!acceptsScan(draft)) return;
  if (!draft.items.size) throw new Error("Scan minimal satu bahan sebelum menyelesaikan scan.");
  const problem = scanProblem(draft);
  if (problem) throw new Error(problem);
  draft.phase = "REVIEW";
}

export function updateScanReview(draft, materials) {
  for (const { materialId, current, issue } of materials) {
    const old = draft.items.get(materialId);
    if (!old) continue;
    draft.items.set(materialId, { ...old, ...current, unavailable: current ? null : issue });
  }
  draft.phase = "REVIEW";
}
