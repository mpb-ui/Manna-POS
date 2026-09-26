// Prices and names supplied for the A3+ catalog. Each side is a separate SKU so
// the existing server-side order pricing can remain authoritative.
export const A3_PAPER_FAMILIES = [
  { name: "Akasia", variants: [["Cream", "A3", 10000, 20000], ["White", "A3", 10000, 20000]] },
  { name: "Art Paper (AP)", variants: [["AP 120", "A3", 8000, 15000], ["AP 150", "A3+", 8000, 15000], ["AP 210", "A3+", 9000, 18000], ["AP 230", "A3", 9000, null], ["AP 260", "A3+", 10000, 20000], ["AP 310", "A3+", 15000, 30000]] },
  { name: "BC Manila", variants: [["BC Manila", "A3+", 7000, 14000]] },
  { name: "BC Tik", variants: [["BC Tik", "A3+", 8500, 16000]] },
  { name: "Bluishwhite", variants: [["Bluishwhite", "A3+", 12000, 24000]] },
  { name: "Concorde", variants: [["Cream", "A3", 12000, 24000], ["White", "A3", 12000, 24000]] },
  { name: "Copenhagen", variants: [["Cream", "A3", 10000, 20000], ["White", "A3", 10000, 20000]] },
  { name: "Hammer", variants: [["Cream", "A3", 12000, 24000], ["White", "A3", 12000, 24000]] },
  { name: "HVS", variants: [["HVS", "A3+", 4000, 8000]] },
  { name: "Jasmine", variants: [["Jasmine", "A3", 10000, 20000]] },
  { name: "Java", variants: [["Cream", "A3+", 12000, 24000]] },
  { name: "Kraft", variants: [["Kraft", "A3", 10000, 20000]] },
  { name: "Linen", variants: [["Linen", "A3", 10000, 20000]] }
];

export const A3_STICKERS = [
  ["Bontak", 15000], ["Gold", 20000], ["Hologram", 20000],
  ["Hologram Glitter", 20000], ["Kraft", 17500], ["Metallize", 20000],
  ["Metallize Matte", 20000], ["Tafetta", 18000], ["Transparant", 17500],
  ["White Glossy", 17500], ["White Matte", 17500]
];

const slug = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const paperFinishes = (side) => [
  "fin-a3-manual", "fin-a3-diecut", "fin-a3-perforation",
  `fin-a3-lam-gloss-${side === "1S" ? "1" : "2"}`,
  `fin-a3-lam-matte-${side === "1S" ? "1" : "2"}`,
  "fin-a3-laminating-a4", "fin-a3-laminating-a3"
];
const stickerFinishes = ["fin-a3-sticker-diecut", "fin-a3-sticker-kisscut", "fin-a3-sticker-knife8", "fin-a3-sticker-transfer"];

function product({ family, variant, size, side, price, kind }) {
  const key = slug(`${kind}-${family}-${variant}-${size}-${side || "single"}`);
  const materialName = family === "Art Paper (AP)" ? variant.replace("AP ", "AP") :
    variant === family ? family : `${family} ${variant}`;
  return {
    id: `a3-${key}`, sku: `A3-${key.toUpperCase()}`, name: kind === "sticker"
      ? `Sticker A3+ ${variant}`
      : `${size} ${materialName} /${side}`,
    category: "Print A3+", a3Kind: kind, a3Family: family, a3Variant: variant, a3Size: size, a3Side: side,
    price, priceBasis: "unit", unitName: "lembar", unitLabel: "/lembar", saleUnit: "lbr",
    widths: [], materialSources: [], machineIds: ["mach-digital"],
    finishingIds: kind === "sticker" ? stickerFinishes : paperFinishes(side),
    note: "",
    active: true, featured: false, wholesaleEnabled: false, priceTiers: [],
    discount: { enabled: false, type: "percent", value: 0, startsAt: "", endsAt: "" }
  };
}

export const A3_CATALOG_PRODUCTS = [
  ...A3_PAPER_FAMILIES.flatMap(({ name, variants }) => variants.flatMap(([variant, size, one, two]) => [
    product({ family: name, variant, size, side: "1S", price: one, kind: "paper" }),
    ...(two == null ? [] : [product({ family: name, variant, size, side: "2S", price: two, kind: "paper" })])
  ])),
  ...A3_STICKERS.map(([variant, price]) => product({ family: variant, variant, size: "A3+", side: "", price, kind: "sticker" }))
];
