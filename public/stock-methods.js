export const STOCK_METHODS = { ROLL: "ROLL", UNIT: "UNIT" };
export function stockMethodLabel(value) { return value === "ROLL" ? "Per Roll" : "Per Satuan"; }
export function normalizedStockUnit(value) {
  const unit = String(value || "").trim().toLowerCase();
  return ({ lbr: "lembar", lembar: "lembar", pcs: "pcs", buah: "pcs", unit: "pcs", roll: "roll", "m2": "m²", "m²": "m²", "m lari": "m", "meter": "m" })[unit] || unit;
}
export function defaultStockMethod(material) {
  if (["ROLL", "UNIT"].includes(material.stockMethod)) return material.stockMethod;
  return /roll/i.test(material.category || "") || normalizedStockUnit(material.unit) === "roll"
    || (/sticker|outdoor|lf sticker|lf poster/i.test(material.category || "") && ["m²", "m"].includes(normalizedStockUnit(material.unit))) ? "ROLL" : "UNIT";
}
