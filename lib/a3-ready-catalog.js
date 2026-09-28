// Each row from the supplied price list is a separate, fixed-price SKU.
// The quantities in square brackets are part of the product name and sale unit.
const rows = [
  ["Kartu Nama AP260/1S", 60000], ["Kartu Nama AP260/2S", 100000],
  ["Kartu Nama AP310/1S", 85000], ["Kartu Nama AP310/2S", 130000],
  ["Kartu Nama BC Tik /1S", 60000], ["Kartu Nama BC Tik /2S", 100000],
  ["Kartu Nama Linen /1S", 85000], ["Kartu Nama Linen /2S", 130000],
  ["[5 Pcs] Map Folder A4 /1S", 85000], ["[5 Pcs] Map Folder A4 /2S", 140000],
  ["Voucher Pad AP150", 97000], ["Voucher Pad AP210", 105000], ["Voucher Pad BC Manila", 105000],
  ["[3Pcs] Tent Card A5 15x20/L", 60000], ["[3Pcs] Tent Card A6 10x15/L", 45000],
  ["[3Pcs] Tent Card A6 10x15/P", 45000], ["[4Pcs] Tent Card 1/3 A4 10x21", 60000],
  ["[4Pcs] Tent Card A5 15x20/P", 60000], ["[5 PAD] Karcis Pad HVS/BW", 180000],
  ["[RIM] Brosur 1/3 A4 AP120 /1S", 600000], ["[RIM] Brosur 1/3 A4 AP120 /2S", 1225000],
  ["[RIM] Brosur 1/3 A4 AP150 /1S", 650000], ["[RIM] Brosur 1/3 A4 AP150 /2S", 1275000],
  ["[RIM] Brosur A3 AP120 /1S", 2200000], ["[RIM] Brosur A3 AP120 /2S", 4225000],
  ["[RIM] Brosur A3 AP150 /1S", 2250000], ["[RIM] Brosur A3 AP150 /2S", 4275000],
  ["[RIM] Brosur A4 AP120 /1S", 1200000], ["[RIM] Brosur A4 AP120 /2S", 2225000],
  ["[RIM] Brosur A4 AP150 /1S", 1450000], ["[RIM] Brosur A4 AP150 /2S", 2350000],
  ["[RIM] Brosur A5 AP120 /1S", 625000], ["[RIM] Brosur A5 AP120 /2S", 1200000],
  ["[RIM] Brosur A5 AP150 /1S", 675000], ["[RIM] Brosur A5 AP150 /2S", 1250000],
  ["Buku Nota 1/2 Folio 1PLY", 105000], ["Buku Nota 1/2 Folio 2PLY", 125000], ["Buku Nota 1/2 Folio 3PLY", 140000],
  ["Buku Nota 1/3 Folio 1PLY", 115500], ["Buku Nota 1/3 Folio 2PLY", 135000], ["Buku Nota 1/3 Folio 3PLY", 150000],
  ["Buku Nota 1/4 Folio 1PLY", 125000], ["Buku Nota 1/4 Folio 2PLY", 145000], ["Buku Nota 1/4 Folio 3PLY", 160000],
  ["Buku Nota Full Folio 1PLY", 85000], ["Buku Nota Full Folio 2PLY", 105000], ["Buku Nota Full Folio 3PLY", 120000],
  ["[RIM] Buku Nota 1/2 Folio 1PLY", 995000], ["[RIM] Buku Nota 1/2 Folio 2PLY", 1162500], ["[RIM] Buku Nota 1/2 Folio 3PLY", 1302000],
  ["[RIM] Buku Nota 1/3 Folio 1PLY", 1074150], ["[RIM] Buku Nota 1/3 Folio 2PLY", 1255500], ["[RIM] Buku Nota 1/3 Folio 3PLY", 1395000],
  ["[RIM] Buku Nota 1/4 Folio 1PLY", 1162500], ["[RIM] Buku Nota 1/4 Folio 2PLY", 1348500], ["[RIM] Buku Nota 1/4 Folio 3PLY", 1488000],
  ["[RIM] Buku Nota Full Folio 1PLY", 790500], ["[RIM] Buku Nota Full Folio 2PLY", 976500], ["[RIM] Buku Nota Full Folio 3PLY", 1120000]
];

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const A3_READY_FINISHINGS = [
  { id: "fin-a3-card-lam-1", code: "FIN-A3R-01", name: "Laminasi Kartu Nama 1 Sisi", categories: ["Print A3+"], price: 25000, rule: "free", active: true },
  { id: "fin-a3-card-lam-2", code: "FIN-A3R-02", name: "Laminasi Kartu Nama 2 Sisi", categories: ["Print A3+"], price: 45000, rule: "free", active: true },
  { id: "fin-a3-card-rounded", code: "FIN-A3R-03", name: "Rounded Kartu Nama", categories: ["Print A3+"], price: 15000, rule: "point", active: true },
  { id: "fin-a3-nota-design", code: "FIN-A3R-04", name: "Fee Design Nota", categories: ["Print A3+"], price: 35000, rule: "free", active: true }
];

export const A3_READY_PRODUCTS = rows.map(([name, price]) => {
  const key = slug(name);
  const isCard = name.startsWith("Kartu Nama ");
  const isNota = name.includes("Buku Nota ");
  const readyGroup = ["Kartu Nama", "Map Folder", "Voucher Pad", "Tent Card", "Karcis Pad", "Brosur", "Buku Nota"]
    .find((group) => name.replace(/^\[[^\]]+\]\s*/, "").startsWith(group));
  const unitName = name.startsWith("[RIM]") ? "rim" : name.startsWith("[5 PAD]") ? "paket (5 pad)"
    : /^\[[345]\s*Pcs\]/i.test(name) ? "paket" : "produk";
  return {
    id: `a3-ready-${key}`, sku: `A3-READY-${key.toUpperCase()}`, name, category: "Print A3+",
    a3Kind: "ready", a3ReadyGroup: readyGroup, a3ReadyType: isCard ? "card" : isNota ? "nota" : "other",
    a3Family: name, a3Variant: name, a3Size: "", a3Side: "", a3PrintMode: "",
    price, priceBasis: "unit", unitName, unitLabel: `/${unitName}`, saleUnit: unitName,
    widths: [], materialSources: [], machineIds: ["mach-digital"],
    finishingIds: isCard ? ["fin-a3-card-lam-1", "fin-a3-card-lam-2", "fin-a3-card-rounded"] : isNota ? ["fin-a3-nota-design"] : [],
    note: "", active: true, featured: false, wholesaleEnabled: false, priceTiers: [],
    discount: { enabled: false, type: "percent", value: 0, startsAt: "", endsAt: "" }
  };
});
