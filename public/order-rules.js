// Shared, read-only rules. File readiness is confirmed by a person, not inferred
// from a design fee or from the historic "SIAP_CETAK" order field.
export const FILE_READINESS = ["UNCONFIRMED", "MISSING", "RECEIVED", "READY"];
export function witaDay(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
export function cancelled(order) {
  return Boolean(order.cancelledAt || order.canceledAt || order.cancelled || order.canceled || ["BATAL", "CANCELLED", "CANCELED"].includes(order.status));
}
export function unconfirmedDraft(order) {
  return order.status === "DRAFT" || (order.status === "MENUNGGU_PEMBAYARAN" && !order.paymentConfirmed && !order.confirmed && !order.confirmedAt);
}
export function needsProduction(item, product = {}) {
  if (typeof item.needsProduction === "boolean") return item.needsProduction;
  return !(product.retailAtK || product.quickSale || ["ATK", "Akrilik", "Stempel"].includes(item.category || product.category));
}
export function needsFile(item, product = {}) {
  if (typeof item.needsFile === "boolean") return item.needsFile;
  return needsProduction(item, product) && !item.templateDesign && !product.templateProduct;
}
export function completeness(order, products = []) {
  const issues = [], items = order.items || [];
  items.forEach((item, index) => {
    const product = products.find(p => p.id === item.productId) || {};
    if (!needsProduction(item, product)) return;
    if ((item.priceBasis || product.priceBasis) !== "unit" && !item.sizeVariantId && (!(Number(item.width) > 0) || !(Number(item.actualLength ?? item.length) > 0))) {
      issues.push({ key: `size-${index}`, label: `Ukuran belum diisi: ${item.productName || product.name || "produk"}`, type: "specification" });
    }
    if (!(Number(item.quantity) > 0)) issues.push({ key: `quantity-${index}`, label: "Jumlah produk belum diisi", type: "specification" });
  });
  return issues;
}
export function itemChecklist(item, product = {}) {
  if (!needsProduction(item, product)) return [];
  const steps = [];
  if (needsFile(item, product)) steps.push({ key: "file", phase: "DESAIN", label: "Periksa file & approval customer" });
  const specification = item.shirtVariants?.length
    ? item.shirtVariants.map(v => `${v.color} ${v.size} × ${v.quantity}`).join(", ")
    : item.displaySize || `${item.quantity} ${product.unitName || "unit"}`;
  steps.push({ key: "specification", phase: "DESAIN", label: `Periksa spesifikasi: ${specification}` });
  steps.push({ key: "print", phase: "CETAK", label: `Periksa hasil cetak / produksi · ${item.quantity} ${product.unitName || "unit"}` });
  if (product.a3ReadyType === "card" || item.isBusinessCard || /kartu nama|business.card/i.test(item.productName || "")) {
    steps.push({ key: "cut", phase: "FINISHING", label: "Potong kartu nama sesuai ukuran" });
  }
  for (const finish of item.finishing || []) {
    if (!(Number(finish.units) > 0)) continue;
    steps.push({ key: `finish:${finish.id}:${finish.units}`, phase: /design|desain/i.test(finish.name) ? "DESAIN" : "FINISHING", label: `${finish.name} × ${finish.units}${finish.note ? ` · ${finish.note}` : ""}` });
  }
  steps.push({ key: "quantity", phase: "FINISHING", label: "Periksa jumlah & kualitas akhir" });
  return steps;
}
