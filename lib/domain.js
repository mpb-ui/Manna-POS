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

export function tierPriceForQuantity(product, quantity) {
  const retailPrice = Number(product.price || 0);
  if (!product.wholesaleEnabled) return retailPrice;
  const numericQuantity = Math.max(1, Number(quantity || 1));
  const tier = (product.priceTiers || [])
    .filter((item) => Number(item.min) <= numericQuantity && (item.max == null || item.max === "" || numericQuantity <= Number(item.max)))
    .sort((a, b) => Number(b.min) - Number(a.min))[0];
  return tier ? Number(tier.price) : retailPrice;
}

export function allowedNextStatus(current) {
  const index = STATUS_SEQUENCE.indexOf(current);
  return index >= 0 && index < STATUS_SEQUENCE.length - 1
    ? STATUS_SEQUENCE[index + 1]
    : null;
}

export function calculateLine(product, input) {
  const isUnit = product.priceBasis === "unit";
  const width = isUnit ? 1 : Number(input.width);
  const actualLength = isUnit ? 1 : Number(input.length);
  const quantity = Math.max(1, Number(input.quantity || 1));
  const billedLength = isUnit ? 1 : roundBillingLength(actualLength);

  if (!isUnit && !product.widths.includes(width)) throw new Error("Lebar bahan tidak tersedia");
  if (!isUnit && (!Number.isFinite(actualLength) || actualLength <= 0)) throw new Error("Panjang tidak valid");

  const baseUnits = isUnit
    ? quantity
    : product.priceBasis === "sqm" ? width * billedLength * quantity : billedLength * quantity;
  const unitPrice = tierPriceForQuantity(product, quantity);
  const baseTotal = Math.round(baseUnits * unitPrice);

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
    unitPrice,
    baseTotal,
    finishing: selectedFinishing,
    finishingTotal,
    subtotal: baseTotal + finishingTotal,
    materials: (product.materialSources || []).map((source) => ({
      materialId: source.materialId,
      sku: source.sku,
      name: source.name,
      unit: source.unit,
      units: Number((Number(source.quantity || 0) * baseUnits * (1 + Number(source.wastePercent || 0) / 100)).toFixed(4))
    })),
    stockSku: isUnit ? `${product.id}-unit` : `${product.id}-${String(width).replace(".", "_")}m`,
    stockConsumption: isUnit ? quantity : billedLength * quantity,
    displaySize: isUnit ? `${quantity} ${product.unitName || "unit"}` : `${width} × ${billedLength} m · ${quantity}x`,
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
