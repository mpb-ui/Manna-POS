import pg from "pg";

const { Pool } = pg;

export const PRODUCTS = [
  {
    id: "fl-280-glossy", name: "FL 280 Glossy", category: "Outdoor",
    price: 30000, priceBasis: "sqm", unitLabel: "/m²", widths: [1, 2, 3],
    note: "Minimum 1×1 m. Panjang dibulatkan per 50 cm.",
    featured: true, recommendation: "Paling sering dipesan",
    finishing: [
      { id: "cut", name: "Potong Pas Gambar", price: 0, rule: "free" },
      { id: "seaming", name: "Seaming Lem Spanduk", price: 2500, rule: "perimeter" },
      { id: "eyelets", name: "Ring Mata Ayam", price: 500, rule: "point" },
      { id: "sleeve-tb", name: "Selongsong Atas–Bawah", price: 10000, rule: "top_bottom" },
      { id: "sleeve-lr", name: "Selongsong Kanan–Kiri", price: 10000, rule: "left_right" },
      { id: "join", name: "Sambung Bahan", price: 10000, rule: "length" }
    ]
  },
  {
    id: "fl-380-matte", name: "FL 380 Matte", category: "Outdoor",
    price: 55000, priceBasis: "sqm", unitLabel: "/m²", widths: [1, 2, 3],
    note: "Lebihan bahan 3–5 cm gratis. Panjang dibulatkan per 50 cm.",
    finishing: [
      { id: "cut", name: "Potong Pas Gambar", price: 0, rule: "free" },
      { id: "seaming", name: "Seaming Lem Spanduk", price: 2500, rule: "perimeter" },
      { id: "eyelets", name: "Ring Mata Ayam", price: 500, rule: "point" },
      { id: "sleeve-tb", name: "Selongsong Atas–Bawah", price: 10000, rule: "top_bottom" },
      { id: "sleeve-lr", name: "Selongsong Kanan–Kiri", price: 10000, rule: "left_right" },
      { id: "join", name: "Sambung Bahan", price: 10000, rule: "length" }
    ]
  },
  {
    id: "fl-410-glossy", name: "FL 410 Glossy", category: "Outdoor",
    price: 55000, priceBasis: "sqm", unitLabel: "/m²", widths: [1, 2],
    note: "Lebihan >5 cm masuk ukuran tagihan. Panjang dibulatkan per 50 cm.",
    finishing: [
      { id: "cut", name: "Potong Pas Gambar", price: 0, rule: "free" },
      { id: "seaming", name: "Seaming Lem Spanduk", price: 2500, rule: "perimeter" },
      { id: "eyelets", name: "Ring Mata Ayam", price: 500, rule: "point" },
      { id: "sleeve-tb", name: "Selongsong Atas–Bawah", price: 10000, rule: "top_bottom" },
      { id: "sleeve-lr", name: "Selongsong Kanan–Kiri", price: 10000, rule: "left_right" },
      { id: "join", name: "Sambung Bahan", price: 10000, rule: "length" }
    ]
  },
  {
    id: "fl-440-matte", name: "FL 440 Matte", category: "Outdoor",
    price: 65000, priceBasis: "sqm", unitLabel: "/m²", widths: [1, 2, 3],
    note: "Bahan outdoor tebal. Panjang dibulatkan per 50 cm.",
    finishing: [
      { id: "cut", name: "Potong Pas Gambar", price: 0, rule: "free" },
      { id: "seaming", name: "Seaming Lem Spanduk", price: 2500, rule: "perimeter" },
      { id: "eyelets", name: "Ring Mata Ayam", price: 500, rule: "point" },
      { id: "sleeve-tb", name: "Selongsong Atas–Bawah", price: 10000, rule: "top_bottom" },
      { id: "sleeve-lr", name: "Selongsong Kanan–Kiri", price: 10000, rule: "left_right" },
      { id: "join", name: "Sambung Bahan", price: 10000, rule: "length" }
    ]
  },
  {
    id: "cloth-banner", name: "Cloth Banner", category: "Outdoor",
    price: 75000, priceBasis: "linear_m", unitLabel: "/m lari", widths: [1, 1.5],
    note: "Panjang dibulatkan per 50 cm.",
    finishing: [
      { id: "cut", name: "Potong Pas Gambar", price: 0, rule: "free" },
      { id: "eyelets", name: "Ring Mata Ayam", price: 500, rule: "point" },
      { id: "stitch-sleeve", name: "Jahit Selongsong T-Banner", price: 10000, rule: "top_bottom" }
    ]
  },
  {
    id: "nb-backlite-510", name: "NB Backlite 510", category: "Outdoor",
    price: 135000, priceBasis: "linear_m", unitLabel: "/m lari", widths: [1, 2, 3],
    note: "Lebihan 3–5 cm gratis. Panjang dibulatkan per 50 cm.",
    finishing: [{ id: "cut", name: "Potong Pas Gambar", price: 0, rule: "free" }]
  },
  {
    id: "art-paper-260", name: "Art Paper 260", category: "Print A3+",
    price: 4500, priceBasis: "unit", unitLabel: "/lembar A3+", unitName: "lembar",
    note: "Harga per lembar A3+. Jumlah cetak mengikuti quantity.", featured: true,
    recommendation: "Sering dipilih minggu ini",
    finishing: [
      { id: "print-2-side", name: "Cetak 2 Sisi", price: 2500, rule: "free" },
      { id: "lam-glossy", name: "Laminasi Glossy", price: 3000, rule: "free" },
      { id: "lam-matte", name: "Laminasi Doff", price: 3500, rule: "free" },
      { id: "cut-paper", name: "Potong Jadi", price: 500, rule: "free" }
    ]
  },
  {
    id: "poster-albatros", name: "Poster Albatros", category: "LF Poster",
    price: 85000, priceBasis: "sqm", unitLabel: "/m²", widths: [1.27, 1.52],
    note: "Minimum 1 m panjang. Panjang dibulatkan per 50 cm.", featured: true,
    recommendation: "Sering dipesan bersama",
    finishing: [
      { id: "cut", name: "Potong Pas Gambar", price: 0, rule: "free" },
      { id: "lam-glossy", name: "Laminasi Glossy", price: 25000, rule: "free" },
      { id: "lam-matte", name: "Laminasi Doff", price: 30000, rule: "free" },
      { id: "double-tape", name: "Double Tape", price: 5000, rule: "free" }
    ]
  },
  {
    id: "lf-sticker-matte", name: "LF Sticker Matte", category: "LF Sticker",
    price: 175000, priceBasis: "sqm", unitLabel: "/m²", widths: [1.27, 1.52],
    note: "Minimum 1 m panjang. Panjang dibulatkan per 50 cm.", featured: true,
    recommendation: "Repeat order tinggi",
    finishing: [
      { id: "cut", name: "Potong Pas Gambar", price: 0, rule: "free" },
      { id: "lam-glossy", name: "Laminasi Glossy", price: 30000, rule: "free" },
      { id: "lam-matte", name: "Laminasi Doff", price: 35000, rule: "free" },
      { id: "contour-cut", name: "Contour Cut", price: 25000, rule: "free" }
    ]
  },
  {
    id: "x-banner-albatros", name: "X-Banner Albatros", category: "Display & Banner",
    price: 350000, priceBasis: "unit", unitLabel: "/set", unitName: "set",
    note: "Harga per set sudah termasuk cetak dan rangka X-Banner.", featured: true,
    recommendation: "Paket favorit UMKM",
    finishing: [
      { id: "bag", name: "Tas X-Banner", price: 25000, rule: "free" },
      { id: "lam-matte", name: "Laminasi Doff", price: 30000, rule: "free" }
    ]
  },
  {
    id: "business-card", name: "Kartu Nama", category: "ATK",
    price: 75000, priceBasis: "unit", unitLabel: "/box", unitName: "box",
    note: "Harga per box. Jumlah box mengikuti quantity.", featured: true,
    recommendation: "Pesanan cepat",
    finishing: [
      { id: "print-2-side", name: "Cetak 2 Sisi", price: 15000, rule: "free" },
      { id: "lam-matte", name: "Laminasi Doff", price: 20000, rule: "free" },
      { id: "rounded-corner", name: "Sudut Bulat", price: 10000, rule: "free" }
    ]
  }
];

export const MATERIALS = [
  { id: "mat-flexi-280", sku: "BHN-FL280", name: "Flexi 280 gsm", category: "Roll Outdoor", unit: "m²", stock: 185, minStock: 30, cost: 14500, supplier: "Supplier Dummy A", active: true },
  { id: "mat-flexi-380", sku: "BHN-FL380", name: "Flexi 380 gsm", category: "Roll Outdoor", unit: "m²", stock: 96, minStock: 20, cost: 26000, supplier: "Supplier Dummy A", active: true },
  { id: "mat-flexi-410", sku: "BHN-FL410", name: "Flexi 410 gsm", category: "Roll Outdoor", unit: "m²", stock: 74, minStock: 20, cost: 29000, supplier: "Supplier Dummy A", active: true },
  { id: "mat-flexi-440", sku: "BHN-FL440", name: "Flexi 440 gsm", category: "Roll Outdoor", unit: "m²", stock: 62, minStock: 15, cost: 34000, supplier: "Supplier Dummy A", active: true },
  { id: "mat-cloth", sku: "BHN-CLOTH", name: "Cloth Banner", category: "Roll Outdoor", unit: "m lari", stock: 51, minStock: 10, cost: 33000, supplier: "Supplier Dummy B", active: true },
  { id: "mat-backlite", sku: "BHN-BACK510", name: "Backlite 510", category: "Roll Outdoor", unit: "m lari", stock: 28, minStock: 8, cost: 68000, supplier: "Supplier Dummy B", active: true },
  { id: "mat-art260", sku: "KRT-AP260", name: "Art Paper 260 gsm A3+", category: "Kertas", unit: "lbr", stock: 1200, minStock: 250, cost: 2100, supplier: "Supplier Dummy C", active: true },
  { id: "mat-albatros", sku: "BHN-ALB", name: "Albatros", category: "Roll Indoor", unit: "m²", stock: 88, minStock: 15, cost: 42000, supplier: "Supplier Dummy B", active: true },
  { id: "mat-sticker", sku: "BHN-STK-M", name: "Sticker Vinyl Matte", category: "Sticker", unit: "m²", stock: 67, minStock: 15, cost: 70000, supplier: "Supplier Dummy D", active: true },
  { id: "mat-xstand", sku: "ACC-XBNR", name: "Kaki X-Banner", category: "Aksesori Display", unit: "pcs", stock: 32, minStock: 8, cost: 105000, supplier: "Supplier Dummy E", active: true },
  { id: "mat-eyelet", sku: "ACC-EYE", name: "Mata Ayam", category: "Aksesori Finishing", unit: "pcs", stock: 1850, minStock: 300, cost: 175, supplier: "Supplier Dummy E", active: true },
  { id: "mat-card", sku: "KRT-CARD", name: "Kertas Kartu Nama SRA3", category: "Kertas", unit: "lbr", stock: 420, minStock: 80, cost: 2400, supplier: "Supplier Dummy C", active: true }
];

export const MACHINES = [
  { id: "mach-eco", code: "MSN-ECO-01", name: "Roland Ecosolvent", type: "Large Format", status: "AKTIF", costPerHour: 45000, capacity: "12 m²/jam", active: true },
  { id: "mach-digital", code: "MSN-DP-01", name: "Konica Minolta A3+", type: "Digital Press", status: "AKTIF", costPerHour: 85000, capacity: "60 lbr/menit", active: true },
  { id: "mach-laminator", code: "MSN-LAM-01", name: "Telson Roll Laminator", type: "Finishing", status: "AKTIF", costPerHour: 18000, capacity: "8 m/menit", active: true },
  { id: "mach-eyelet", code: "MSN-EYE-01", name: "Mesin Mata Ayam", type: "Finishing", status: "AKTIF", costPerHour: 8000, capacity: "120 pcs/jam", active: true },
  { id: "mach-cut", code: "MSN-CUT-01", name: "Saga 1604 Pro", type: "Cutting Plotter", status: "AKTIF", costPerHour: 30000, capacity: "10 m²/jam", active: true }
];

const PRODUCT_META = {
  "fl-280-glossy": { sku: "PRD-FL280", baseCost: 14500, saleUnit: "m²", machineIds: ["mach-eco", "mach-eyelet"], sources: [["mat-flexi-280", 1, 5]] },
  "fl-380-matte": { sku: "PRD-FL380", baseCost: 26000, saleUnit: "m²", machineIds: ["mach-eco", "mach-eyelet"], sources: [["mat-flexi-380", 1, 5]] },
  "fl-410-glossy": { sku: "PRD-FL410", baseCost: 29000, saleUnit: "m²", machineIds: ["mach-eco", "mach-eyelet"], sources: [["mat-flexi-410", 1, 5]] },
  "fl-440-matte": { sku: "PRD-FL440", baseCost: 34000, saleUnit: "m²", machineIds: ["mach-eco", "mach-eyelet"], sources: [["mat-flexi-440", 1, 5]] },
  "cloth-banner": { sku: "PRD-CLOTH", baseCost: 33000, saleUnit: "m lari", machineIds: ["mach-eco"], sources: [["mat-cloth", 1, 5]] },
  "nb-backlite-510": { sku: "PRD-BACK510", baseCost: 68000, saleUnit: "m lari", machineIds: ["mach-eco"], sources: [["mat-backlite", 1, 5]] },
  "art-paper-260": { sku: "PRD-AP260", baseCost: 2100, saleUnit: "lbr", machineIds: ["mach-digital"], sources: [["mat-art260", 1, 2]] },
  "poster-albatros": { sku: "PRD-ALBPOST", baseCost: 42000, saleUnit: "m²", machineIds: ["mach-eco"], sources: [["mat-albatros", 1, 5]] },
  "lf-sticker-matte": { sku: "PRD-STKM", baseCost: 70000, saleUnit: "m²", machineIds: ["mach-eco", "mach-cut", "mach-laminator"], sources: [["mat-sticker", 1, 7]] },
  "x-banner-albatros": { sku: "PRD-XBNR", baseCost: 215000, saleUnit: "set", machineIds: ["mach-eco", "mach-eyelet"], sources: [["mat-albatros", .8, 5], ["mat-xstand", 1, 0], ["mat-eyelet", 4, 0]], wholesale: true },
  "business-card": { sku: "PRD-KNAME", baseCost: 36000, saleUnit: "box", machineIds: ["mach-digital"], sources: [["mat-card", 12, 3]], wholesale: true }
};

function defaultTiers(product, enabled = false) {
  const price = Number(product.price || 0);
  return {
    wholesaleEnabled: enabled,
    priceTiers: [
      { min: 1, max: 1, price },
      { min: 2, max: 10, price: Math.round(price * .9 / 500) * 500 },
      { min: 11, max: null, price: Math.round(price * .8 / 500) * 500 }
    ]
  };
}

function seededProducts() {
  return PRODUCTS.map((product) => {
    const meta = PRODUCT_META[product.id] || {};
    return {
      ...structuredClone(product), sku: meta.sku || product.id.toUpperCase(), baseCost: meta.baseCost || 0,
      saleUnit: meta.saleUnit || product.unitName || "pcs", active: true, machineIds: meta.machineIds || [],
      materialSources: (meta.sources || []).map(([materialId, quantity, wastePercent]) => ({ materialId, quantity, wastePercent })),
      ...defaultTiers(product, Boolean(meta.wholesale))
    };
  });
}

function hydrateProduct(product, materials) {
  const fallback = seededProducts().find((item) => item.id === product.id) || {};
  const merged = { active: true, widths: [], finishing: [], machineIds: [], materialSources: [], ...fallback, ...product };
  merged.materialSources = (merged.materialSources || []).map((source) => {
    const material = materials.find((item) => item.id === source.materialId);
    return { ...source, sku: material?.sku || source.sku, name: material?.name || source.name, unit: material?.unit || source.unit };
  });
  return merged;
}

function inventoryRows(materials) {
  const timestamp = new Date().toISOString();
  return materials.map((material) => ({
    sku: material.sku, materialId: material.id, productName: material.name, width: null,
    quantity: Number(material.stock || 0), minStock: Number(material.minStock || 0), unit: material.unit, updatedAt: timestamp
  }));
}

function syncCatalog(state) {
  state.materials ||= structuredClone(MATERIALS);
  state.machines ||= structuredClone(MACHINES);
  state.products = (state.products?.length ? state.products : seededProducts()).map((product) => hydrateProduct(product, state.materials));
  if (!state.catalogVersion) {
    const previousInventory = state.inventory || [];
    state.inventory = inventoryRows(state.materials).map((row) => {
      const current = previousInventory.find((item) => item.sku === row.sku);
      return current ? { ...row, quantity: Number(current.quantity || row.quantity), updatedAt: current.updatedAt || row.updatedAt } : row;
    });
    state.catalogVersion = 2;
  } else {
    state.inventory ||= [];
    for (const row of inventoryRows(state.materials)) {
      const current = state.inventory.find((item) => item.sku === row.sku);
      if (!current) state.inventory.push(row);
      else Object.assign(current, { materialId: row.materialId, productName: row.productName, minStock: row.minStock, unit: row.unit });
    }
  }
  return state;
}

export function seedState() {
  const materials = structuredClone(MATERIALS);
  const inventory = inventoryRows(materials);
  return {
    products: seededProducts(),
    materials,
    machines: structuredClone(MACHINES),
    inventory,
    orders: [],
    activities: [],
    stockMovements: [],
    nextOrderNumber: 1,
    catalogVersion: 2
  };
}

export class Store {
  constructor(connectionString) {
    this.pool = connectionString ? new Pool({ connectionString, ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false } }) : null;
    this.memory = seedState();
  }

  async init() {
    if (!this.pool) return;
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.pool.query(
      "INSERT INTO app_state (id, data) VALUES ('main', $1::jsonb) ON CONFLICT (id) DO NOTHING",
      [JSON.stringify(seedState())]
    );
  }

  async read() {
    if (!this.pool) return syncCatalog(structuredClone(this.memory));
    const result = await this.pool.query("SELECT data FROM app_state WHERE id = 'main'");
    return syncCatalog(result.rows[0].data);
  }

  async mutate(mutator) {
    if (!this.pool) {
      const draft = syncCatalog(structuredClone(this.memory));
      const result = await mutator(draft);
      this.memory = draft;
      return result;
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query("SELECT data FROM app_state WHERE id = 'main' FOR UPDATE");
      const draft = syncCatalog(selected.rows[0].data);
      const result = await mutator(draft);
      await client.query("UPDATE app_state SET data = $1::jsonb, updated_at = NOW() WHERE id = 'main'", [JSON.stringify(draft)]);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
