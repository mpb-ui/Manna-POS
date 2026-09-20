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

function inventoryRows(products) {
  return products.flatMap((product) => product.priceBasis === "unit"
    ? [{
        sku: `${product.id}-unit`, productId: product.id, productName: product.name,
        width: null, quantity: 0, unit: product.unitName || "unit", updatedAt: new Date().toISOString()
      }]
    : product.widths.map((width) => ({
        sku: `${product.id}-${String(width).replace(".", "_")}m`, productId: product.id,
        productName: product.name, width, quantity: 0, unit: "m lari", updatedAt: new Date().toISOString()
      })));
}

function syncCatalog(state) {
  state.products = structuredClone(PRODUCTS);
  state.inventory ||= [];
  for (const row of inventoryRows(PRODUCTS)) {
    const current = state.inventory.find((item) => item.sku === row.sku);
    if (!current) state.inventory.push(row);
    else {
      current.productName = row.productName;
      current.productId = row.productId;
      current.width = row.width;
      current.unit = row.unit;
    }
  }
  return state;
}

export function seedState() {
  const inventory = inventoryRows(PRODUCTS);
  return {
    products: PRODUCTS,
    inventory,
    orders: [],
    activities: [],
    stockMovements: [],
    nextOrderNumber: 1
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
