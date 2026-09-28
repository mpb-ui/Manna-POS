// Fixed selling prices transcribed from the supplied Akrilik and Stempel screenshots.
// No material, cost, or stock quantity was supplied for these products.
const acrylic = [
  ["Akrilik Display 7x4", 12000], ["Akrilik Kartu Nama", 40000],
  ["Akrilik Kotak Saran", 380000], ["Akrilik Nama Meja 30x7cm", 45000],
  ["Akrilik Nama Meja 30x8cm", 55000], ["Akrilik Open/Close 1S", 190000],
  ["Akrilik Open/Close 2S", 215000], ["Akrilik Rak Brosur 1/3 A4", 60000],
  ["Akrilik Rak Brosur A4", 120000], ["Akrilik Rak Brosur A5", 75000],
  ["Akrilik Tent 1/3 A4", 65000], ["Akrilik Tent 8x12", 35000],
  ["Akrilik Tent A3/L", 150000], ["Akrilik Tent A3/P", 150000],
  ["Akrilik Tent A4/L", 85000], ["Akrilik Tent A4/P", 85000],
  ["Akrilik Tent A5/P", 60000], ["Akrilik Tent A5/P Segitiga", 65000],
  ["Akrilik Tent A5/P Segitiga Sliding", 65000], ["Akrilik Tent A6/P", 40000],
  ["Akrilik Tent A6/P Segitiga", 45000], ["Akrilik Thicker A4", 65000],
  ["Akrilik Thicker A5", 55000], ["Akrilik Wall Frame A1", 575000],
  ["Akrilik Wall Frame A2", 350000], ["Akrilik Wall Frame A3", 250000],
  ["Akrilik Wall Frame A4", 220000]
];

const stamps = [
  ["Stempel Bulat D12", 100000], ["Stempel Bulat D17", 100000],
  ["Stempel Bulat D23", 100000], ["Stempel Bulat D25", 100000],
  ["Stempel Bulat D36", 130000], ["Stempel Bulat D40", 130000],
  ["Stempel Bulat D42", 130000],
  ["Stempel Flash Ink - Black", 10000], ["Stempel Flash Ink - Blue", 10000],
  ["Stempel Flash Ink - Brown", 15000], ["Stempel Flash Ink - Green", 15000],
  ["Stempel Flash Ink - Orange", 15000], ["Stempel Flash Ink - Pink", 15000],
  ["Stempel Flash Ink - Purple", 10000], ["Stempel Flash Ink - Red", 15000],
  ["Stempel Flash Ink - Yellow", 15000],
  ["Stempel Kotak 40x40", 130000], ["Stempel Kotak 55x55", 140000],
  ["Stempel Oval 52x37", 130000],
  ["Stempel PP 10x27", 100000], ["Stempel PP 10x45", 100000],
  ["Stempel PP 13x35", 100000], ["Stempel PP 18x55", 130000],
  ["Stempel PP 27x104", 130000], ["Stempel PP 27x55", 130000],
  ["Stempel PP 43x67", 140000], ["Stempel PP 43x80", 140000],
  ["Stempel PP 55x67", 140000], ["Stempel PP 65x95", 150000],
  ["Stempel PP 80x103", 150000]
];

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const DIRECT_PRODUCTS = Object.entries({ Akrilik: acrylic, Stempel: stamps }).flatMap(([category, rows]) => rows.map(([name, price]) => {
  const key = slug(name);
  return {
    id: `direct-${key}`, sku: `DIRECT-${key.toUpperCase()}`, name, category, quickSale: true,
    price, priceBasis: "unit", unitName: "pcs", unitLabel: "/pcs", saleUnit: "pcs", baseCost: 0,
    widths: [], materialSources: [], machineIds: [], finishingIds: [], finishing: [],
    active: true, featured: false, wholesaleEnabled: false, priceTiers: [],
    discount: { enabled: false, type: "percent", value: 0, startsAt: "", endsAt: "" }
  };
}));
