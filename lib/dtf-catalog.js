export const DTF_COLORS = ["Hitam", "Putih"];
export const DTF_SIZES = ["S", "M", "L", "XL", "XXL"];

export const DTF_PACKAGES = [
  { id: "logo", label: "Logo", price: 95000 },
  { id: "logo-logo", label: "Logo + Logo", price: 100000 },
  { id: "logo-a4", label: "Logo + A4", price: 120000 },
  { id: "logo-a3", label: "Logo + A3", price: 135000 },
  { id: "a4-one", label: "A4 1 Sisi", price: 110000 },
  { id: "a4-a4", label: "A4 + A4", price: 130000 },
  { id: "a4-a3", label: "A4 + A3", price: 100000 },
  { id: "a3-one", label: "A3 1 Sisi", price: 120000 },
  { id: "a3-a3", label: "A3 + A3", price: 145000 }
];

export const DTF_SHIRT_MATERIALS = DTF_COLORS.flatMap((color) => DTF_SIZES.map((size) => ({
  id: `mat-dtf-shirt-${color === "Hitam" ? "black" : "white"}-${size.toLowerCase()}`,
  sku: `KAOS-${color === "Hitam" ? "HIT" : "PUT"}-${size}`,
  name: `Kaos Polos ${color} ${size}`,
  category: "Kaos Polos DTF",
  unit: "pcs",
  stock: 0,
  minStock: 0,
  cost: 0,
  supplier: "",
  active: true
})));

export const DTF_SHIRT_PRODUCT = {
  id: "dtf-sablon-kaos", sku: "DTF-KAOS", name: "Sablon Kaos", category: "Sablon DTF",
  price: 95000, priceBasis: "unit", saleUnit: "pcs", unitName: "pcs", unitLabel: "/pcs",
  groupedProduct: true, dtfShirt: true, dtfPackages: DTF_PACKAGES,
  materialSources: [], machineIds: ["mach-dtf"], finishingIds: [], finishing: [],
  note: "Pilih paket sablon, lalu isi warna, ukuran, dan jumlah kaos.", active: true,
  featured: false, wholesaleEnabled: false
};
