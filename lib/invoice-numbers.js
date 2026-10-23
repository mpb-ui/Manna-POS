export const INVOICE_NUMBER_VERSION = 1;

export function invoiceCode(number, at = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
  const [year, month, date] = day.split("-");
  return `INV-${month}${date}${year.slice(-2)}-${String(number).padStart(3, "0")}`;
}

export function compactInvoiceCode(code) {
  const match = String(code || "").match(/^MP-(\d{4})(\d{2})(\d{2})-(\d+)$/);
  if (!match) return code;
  return `INV-${match[2]}${match[3]}${match[1].slice(-2)}-${String(Number(match[4])).padStart(3, "0")}`;
}

export function migrateInvoiceNumbers(state) {
  // During a rolling deploy an older instance can briefly create MP invoices.
  if (state.invoiceNumberVersion === INVOICE_NUMBER_VERSION && !(state.orders || []).some(order => /^MP-\d{8}-\d+$/.test(order.code))) return;
  const changes = new Map(), used = new Set();
  // Validate the complete mapping before changing any invoice or reference.
  for (const order of state.orders || []) {
    if (!order.code) continue;
    const code = compactInvoiceCode(order.code);
    if (used.has(code)) throw new Error(`Nomor invoice bertabrakan: ${code}`);
    used.add(code);
    if (code !== order.code) changes.set(order.code, code);
  }
  for (const order of state.orders || []) {
    if (!changes.has(order.code)) continue;
    order.invoiceAliases = [...new Set([...(order.invoiceAliases || []), order.code])];
    order.code = changes.get(order.code);
  }
  // Preserve original audit text, notes, request fingerprints and invoice aliases.
  // Only structured invoice references and operation result snapshots change.
  const updateReferences = value => {
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      if (["orderCode", "invoice", "code"].includes(key) && typeof entry === "string" && changes.has(entry)) value[key] = changes.get(entry);
      else if (key !== "invoiceAliases") updateReferences(entry);
    }
  };
  for (const key of ["orders", "activities", "depositLedger", "cashReceipts", "stockMovements", "auditLogs", "customerOperations"]) updateReferences(state[key]);
  state.invoiceNumberVersion = INVOICE_NUMBER_VERSION;
  state.invoiceNumberMigration = { converted: changes.size, at: new Date().toISOString() };
}
