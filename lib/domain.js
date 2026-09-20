export const STATUS = {
  WAITING_PAYMENT: "MENUNGGU_PEMBAYARAN",
  DESIGN: "DESAIN",
  PRINT: "CETAK",
  FINISHING: "FINISHING",
  DONE: "SELESAI",
  PICKED_UP: "DIAMBIL"
};

export const STATUS_LABEL = {
  MENUNGGU_PEMBAYARAN: "Menunggu Pembayaran",
  DESAIN: "Operator Design",
  CETAK: "Proses Cetak",
  FINISHING: "Proses Finishing",
  SELESAI: "Selesai",
  DIAMBIL: "Pesanan Diambil"
};

export const STATUS_SEQUENCE = Object.values(STATUS);

export function roundBillingLength(value) {
  const numeric = Number(value || 0);
  return Math.max(1, Math.ceil(numeric * 2 - 1e-9) / 2);
}

export function allowedNextStatus(current) {
  const index = STATUS_SEQUENCE.indexOf(current);
  return index >= 0 && index < STATUS_SEQUENCE.length - 1
    ? STATUS_SEQUENCE[index + 1]
    : null;
}

export function calculateLine(product, input) {
  const width = Number(input.width);
  const actualLength = Number(input.length);
  const quantity = Math.max(1, Number(input.quantity || 1));
  const billedLength = roundBillingLength(actualLength);

  if (!product.widths.includes(width)) throw new Error("Lebar bahan tidak tersedia");
  if (!Number.isFinite(actualLength) || actualLength <= 0) throw new Error("Panjang tidak valid");

  const baseUnits = product.priceBasis === "sqm"
    ? width * billedLength * quantity
    : billedLength * quantity;
  const baseTotal = Math.round(baseUnits * product.price);

  let finishingTotal = 0;
  const selectedFinishing = [];
  for (const request of input.finishing || []) {
    const finish = product.finishing.find((item) => item.id === request.id);
    if (!finish) continue;
    const units = finish.rule === "free"
      ? Math.max(1, Number(request.units || 1))
      : Math.max(0, Number(request.units || 0));
    if (!Number.isFinite(units)) throw new Error("Jumlah finishing tidak valid");
    const subtotal = Math.round(units * finish.price);
    finishingTotal += subtotal;
    selectedFinishing.push({
      id: finish.id,
      name: finish.name,
      units,
      unitPrice: finish.price,
      subtotal
    });
  }

  return {
    productId: product.id,
    productName: product.name,
    width,
    actualLength,
    billedLength,
    quantity,
    priceBasis: product.priceBasis,
    unitPrice: product.price,
    baseTotal,
    finishing: selectedFinishing,
    finishingTotal,
    subtotal: baseTotal + finishingTotal,
    stockSku: `${product.id}-${String(width).replace(".", "_")}m`,
    stockConsumption: billedLength * quantity,
    productionNote: String(input.productionNote || "").trim()
  };
}

export function calculateOrder(products, lines) {
  const normalized = lines.map((line) => {
    const product = products.find((item) => item.id === line.productId);
    if (!product) throw new Error("Produk tidak ditemukan");
    return calculateLine(product, line);
  });
  return {
    items: normalized,
    total: normalized.reduce((sum, line) => sum + line.subtotal, 0)
  };
}
