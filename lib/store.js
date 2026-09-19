import pg from "pg";

const { Pool } = pg;

export const PRODUCTS = [
  {
    id: "fl-280-glossy", name: "FL 280 Glossy", category: "Outdoor",
    price: 30000, priceBasis: "sqm", unitLabel: "/m²", widths: [1, 2, 3],
    note: "Minimum 1×1 m. Panjang dibulatkan per 50 cm.",
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
  }
];

export function seedState() {
  const inventory = PRODUCTS.flatMap((product) => product.widths.map((width) => ({
    sku: `${product.id}-${String(width).replace(".", "_")}m`,
    productId: product.id,
    productName: product.name,
    width,
    quantity: 0,
    unit: "m lari",
    updatedAt: new Date().toISOString()
  })));
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
    if (!this.pool) return structuredClone(this.memory);
    const result = await this.pool.query("SELECT data FROM app_state WHERE id = 'main'");
    return result.rows[0].data;
  }

  async mutate(mutator) {
    if (!this.pool) {
      const draft = structuredClone(this.memory);
      const result = await mutator(draft);
      this.memory = draft;
      return result;
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query("SELECT data FROM app_state WHERE id = 'main' FOR UPDATE");
      const draft = selected.rows[0].data;
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
