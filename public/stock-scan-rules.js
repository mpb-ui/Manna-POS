export const SCAN_COMMANDS = [
  ["CMD:IN", "Stok Masuk"],
  ["CMD:OUT", "Stok Keluar"],
  ["CMD:REVIEW", "Selesai Scan"],
  ["CMD:CANCEL", "Batal Scan"]
];
export const SCAN_QUANTITIES = [1, 2, 3, 5, 10];
export const MAX_SCAN_ITEMS = 50;
export const MATERIAL_SCAN_ID = /^[a-zA-Z0-9_-]{1,160}$/;
export const STAFF_SCAN_CODE = /^STF:(?:U[a-zA-Z0-9_-]{22}|E[a-zA-Z0-9_-]{1,160})$/;
export const stockUpdatedKey = "manna-pos-stock-updated";
export const scanModeLabel = direction => direction === "IN" ? "Stok Masuk" : "Stok Keluar";

export function signalStockUpdate() {
  try { localStorage.setItem(stockUpdatedKey, crypto.randomUUID()); } catch { /* Storage may be blocked by the browser. */ }
}

export function stockScanAccess(user) {
  const permissions = user?.permissions || [];
  const view = permissions.includes("stock.view");
  const supervisor = view && ["OWNER", "MANAGER"].includes(user?.role) && permissions.includes("stock.adjust");
  return {
    scan: view && (supervisor || permissions.includes("stock.scan")),
    print: view && (supervisor || permissions.includes("stock.scan.print")),
    correct: supervisor
  };
}

export function parseStockBarcode(value) {
  const code = String(value).trim();
  const command = SCAN_COMMANDS.find(([key]) => key === code);
  if (command) return { type: "command", value: code.slice(4) };
  if (STAFF_SCAN_CODE.test(code)) return { type: "staff", value: code };
  if (code.startsWith("MAT:") && MATERIAL_SCAN_ID.test(code.slice(4))) return { type: "material", value: code.slice(4) };
  if (SCAN_QUANTITIES.some(quantity => code === `QTY:${quantity}`)) return { type: "quantity", value: Number(code.slice(4)) };
  return null;
}
