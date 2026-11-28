import { isMerchandise } from "./product-kind.js";

export const POS_BARCODE_MAX_LENGTH = 128;
export const internalBarcodePrefix = /^MPP\d{8}$/i;
export const inventoryBarcode = /^(?:MAT|CMD|QTY)\s*:/i;

export function barcodeText(value) {
  if (typeof value !== "string") return "";
  const code = value.trim();
  return code.length <= POS_BARCODE_MAX_LENGTH && /^[ -~]+$/.test(code) ? code : "";
}

export function barcodeTargetKey({ materialVariantId = "", subVariantId = "", sizeVariantId = "" }) {
  return JSON.stringify([materialVariantId, subVariantId, sizeVariantId]);
}

export function merchandiseBarcodeTargets(product) {
  if (!isMerchandise(product) || product.deletedAt) return [];
  const materials = product.hasMaterialVariants ? product.materialVariants || [] : [null];
  const sizes = product.fixedSizeVariants?.length ? product.fixedSizeVariants : [null];
  const targets = [];
  for (const material of materials) {
    if (material?.active === false) continue;
    const options = material && product.subVariants?.length ? product.subVariants : [null];
    for (const option of options) {
      const combination = option && material.combinations?.find(row => row.subVariantId === option.id);
      if (option && (!combination || combination.active === false || option.active === false)) continue;
      for (const size of sizes) {
        if (size?.active === false) continue;
        const selection = {
          materialVariantId: material?.id || "",
          subVariantId: option?.id || "",
          sizeVariantId: size?.id || ""
        };
        targets.push({
          key: barcodeTargetKey(selection),
          label: [material?.label, option?.label, size?.label].filter(Boolean).join(" · "),
          selection
        });
      }
    }
  }
  return targets;
}

// Scanner output carries the data, which is separate from the original symbology.
export function retailBarcodeFormat(code) {
  if (![8, 12, 13].includes(code.length) || !/^\d+$/.test(code)) return "CODE128";
  const digits = [...code].map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  if ((10 - sum % 10) % 10 !== check) return "CODE128";
  return { 8: "EAN8", 12: "UPC", 13: "EAN13" }[code.length];
}

export function upcEanEquivalent(code) {
  const format = retailBarcodeFormat(code);
  if (format === "UPC") return "0" + code;
  if (format === "EAN13" && code.startsWith("0")) return code.slice(1);
  return null;
}
