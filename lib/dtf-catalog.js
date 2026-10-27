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
  id: "dtf-sablon-kaos", sku: "DTF-KAOS", name: "Sablon Kaos", category: "Merchandise",
  price: 95000, priceBasis: "unit", saleUnit: "pcs", unitName: "pcs", unitLabel: "/pcs",
  groupedProduct: true, dtfShirt: true, dtfPackages: DTF_PACKAGES,
  dtfStockVariants: DTF_SHIRT_MATERIALS.map((material) => ({ color: material.name.split(" ")[2], size: material.name.split(" ")[3], materialId: material.id })),
  materialSources: [], machineIds: ["mach-dtf"], finishingIds: [], finishing: [],
  note: "Pilih paket sablon, lalu isi warna, ukuran, dan jumlah kaos.", active: true,
  featured: false, wholesaleEnabled: false
};

export const DTF_MERCHANDISE_VERSION = 1;
export function migrateDtfMerchandise(state) {
  if(Number(state.dtfMerchandiseVersion || 0)>=DTF_MERCHANDISE_VERSION)return false;
  const options=state.catalogOptions ||= {categories:[]}, target='Merchandise';
  options.categories ||= [];
  const sources=new Set((options.categories || []).filter(label=>/^sablon\s*dtf$/i.test(label.trim()) || options.categoryKeys?.[label]==='sablon-dtf'));
  sources.add('Sablon DTF');
  if(!options.categories.includes(target))options.categories.push(target);
  for(const product of state.products || []) {
    if(product.dtfShirt || sources.has(product.category))product.category=target;
    for(const finish of product.finishing || [])if(finish.categories)finish.categories=[...new Set(finish.categories.map(label=>sources.has(label)?target:label))];
  }
  for(const finish of state.finishings || [])finish.categories=[...new Set((finish.categories || []).map(label=>sources.has(label)?target:label))];
  options.categories=options.categories.filter(label=>!sources.has(label));
  for(const source of sources)if(options.categoryKeys)delete options.categoryKeys[source];
  // Product IDs, package prices, material bindings, orders and balances are unchanged.
  state.dtfMerchandiseVersion=DTF_MERCHANDISE_VERSION;
  return true;
}
