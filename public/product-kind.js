export const PRODUCT_KIND = {
  PRODUCTION: "PRODUCTION",
  MERCHANDISE: "MERCHANDISE"
};

const supportedCategories = new Set(["akrilik", "akrilik-frame", "frame-foto", "foto-frame"]);

export function supportsProductKind(categoryId, label) {
  const slug = String(label || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return supportedCategories.has(categoryId) || supportedCategories.has(slug);
}

export function isMerchandise(product) {
  return product?.retailAtK === true || product?.productKind === PRODUCT_KIND.MERCHANDISE;
}

export function isQuickSale(product) {
  return isMerchandise(product) || product?.quickSale === true;
}
