import pg from "pg";

const { Pool } = pg;

const LF_POSTER_STANDARD_FINISHING = [
  { id: "cut", name: "Potong Pas Gambar", price: 0, rule: "free" },
  { id: "eyelets", name: "Ring Mata Ayam", price: 500, rule: "point" },
  { id: "manual-cut-lf", name: "Cutting Manual LF", price: 45000, rule: "area" }
];
const LF_POSTER_CANVAS_FINISHING = [
  { id: "cut", name: "Potong Pas Gambar", price: 0, rule: "free" },
  { id: "extra", name: "Lebihan", price: 0, rule: "free" }
];
const LF_STICKER_STANDARD_FINISHING = [
  { id: "cut", name: "Potong Pas Gambar", price: 0, rule: "free" },
  { id: "extra", name: "Lebihan", price: 0, rule: "free" },
  { id: "kisscut", name: "Kisscut LF", price: 45000, rule: "area" },
  { id: "manual-cut-lf", name: "Cutting Manual LF", price: 45000, rule: "area" },
  { id: "transfer", name: "Transfer Sticker", price: 30000, rule: "area" }
];
const LF_STICKER_SANDBLAST_FINISHING = [
  { id: "cut", name: "Potong Pas Gambar", price: 0, rule: "free" },
  { id: "extra", name: "Lebihan", price: 0, rule: "free" },
  { id: "kisscut", name: "Kisscut LF", price: 45000, rule: "area" }
];
const FIXED_SIZE_CUT_FINISHING = [{ id: "cut", name: "Potong Pas Gambar", price: 0, rule: "free" }];

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
    id: "spanduk-template", name: "Spanduk Template", category: "Outdoor",
    price: 30000, priceBasis: "sqm", unitLabel: "/m²", widths: [1.5, 2, 3],
    note: "Ukuran dan design sudah tersedia. Pilih varian tanpa input ukuran manual.",
    templateProduct: true,
    templateDesignPrice: 35000,
    sizeVariants: [
      { id: "1-5x1", label: "1.5 × 1 meter", width: 1.5, length: 1 },
      { id: "2x1-5", label: "2 × 1.5 meter", width: 2, length: 1.5 },
      { id: "3x2", label: "3 × 2 meter", width: 3, length: 2 }
    ],
    designTemplates: ["SB-01", "SB-02", "SB-03", "SB-04", "SB-05", "KDR-01", "KDR-02", "KDR-03", "KDR-04", "KDR-05"],
    finishing: [
      { id: "cut", name: "Potong Pas Gambar", price: 0, rule: "free" },
      { id: "seaming", name: "Seaming Lem", price: 2500, rule: "perimeter" },
      { id: "eyelets", name: "Mata Ayam", price: 500, rule: "point" },
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
    id: "poster-albatros", name: "Albatros", category: "LF Poster",
    price: 150000, priceBasis: "sqm", unitLabel: "/m²", widths: [0.9, 1.2, 1.5], billingIncrement: 0.1,
    fixedSizeVariants: [{ id: "a1", label: "A1", price: 100000, area: 0.5 }],
    note: "Minimum 1×1 m. Panjang dibulatkan ke atas per 10 cm.", featured: true,
    recommendation: "Sering dipesan bersama",
    finishing: LF_POSTER_STANDARD_FINISHING
  },
  {
    id: "poster-luster", name: "Luster", category: "LF Poster",
    price: 180000, priceBasis: "sqm", unitLabel: "/m²", widths: [0.9, 1.2, 1.5], billingIncrement: 0.1,
    fixedSizeVariants: [{ id: "a1", label: "A1", price: 125000, area: 0.5 }],
    note: "Minimum 1×1 m. Panjang dibulatkan ke atas per 10 cm.", finishing: LF_POSTER_STANDARD_FINISHING
  },
  {
    id: "poster-canvas", name: "Canvas", category: "LF Poster",
    price: 350000, priceBasis: "sqm", unitLabel: "/m²", widths: [1.2], billingIncrement: 0.1,
    note: "Minimum 1×1 m. Panjang dibulatkan ke atas per 10 cm.", finishing: LF_POSTER_CANVAS_FINISHING
  },
  {
    id: "poster-backlite-film", name: "Backlite Film", category: "LF Poster",
    price: 100000, priceBasis: "unit", unitLabel: "/lembar", unitName: "lembar",
    fixedSizeVariants: [
      { id: "a4", label: "A4", price: 100000, area: 0.0625 },
      { id: "a3", label: "A3", price: 125000, area: 0.125 },
      { id: "a2", label: "A2", price: 150000, area: 0.25 },
      { id: "a1", label: "A1", price: 175000, area: 0.5 }
    ],
    note: "Pilih ukuran jadi A4, A3, A2, atau A1.", finishing: FIXED_SIZE_CUT_FINISHING
  },
  {
    id: "lf-sticker-transparent", name: "LF Sticker Transparant", category: "LF Sticker",
    price: 165000, priceBasis: "sqm", unitLabel: "/m²", widths: [1.5], billingIncrement: 0.1,
    fixedSizeVariants: [{ id: "a1", label: "A1", price: 125000, area: 0.5 }],
    note: "Minimum 1×1 m. Panjang dibulatkan ke atas per 10 cm.", finishing: LF_STICKER_STANDARD_FINISHING
  },
  {
    id: "lf-sticker-white-glossy", name: "LF Sticker White Glossy", category: "LF Sticker",
    price: 165000, priceBasis: "sqm", unitLabel: "/m²", widths: [1, 1.5], billingIncrement: 0.1,
    fixedSizeVariants: [{ id: "a1", label: "A1", price: 125000, area: 0.5 }],
    note: "Minimum 1×1 m. Panjang dibulatkan ke atas per 10 cm.", finishing: LF_STICKER_STANDARD_FINISHING
  },
  {
    id: "lf-sticker-matte", name: "LF Sticker White Matte", category: "LF Sticker",
    price: 165000, priceBasis: "sqm", unitLabel: "/m²", widths: [1, 1.5], billingIncrement: 0.1,
    fixedSizeVariants: [{ id: "a1", label: "A1", price: 125000, area: 0.5 }],
    note: "Minimum 1×1 m. Panjang dibulatkan ke atas per 10 cm.", featured: true,
    recommendation: "Repeat order tinggi",
    finishing: LF_STICKER_STANDARD_FINISHING
  },
  {
    id: "lf-sticker-sandblast-print", name: "LF Sticker Sandblast Cetak", category: "LF Sticker",
    price: 135000, priceBasis: "sqm", unitLabel: "/m²", widths: [1, 1.5], billingIncrement: 0.1,
    note: "Minimum 1×1 m. Panjang dibulatkan ke atas per 10 cm.", finishing: LF_STICKER_SANDBLAST_FINISHING
  },
  {
    id: "lf-sticker-sandblast-plain", name: "LF Sticker Sandblast Tanpa Cetak", category: "LF Sticker",
    price: 95000, priceBasis: "sqm", unitLabel: "/m²", widths: [1, 1.5], billingIncrement: 0.1,
    note: "Minimum 1×1 m. Panjang dibulatkan ke atas per 10 cm.", finishing: LF_STICKER_SANDBLAST_FINISHING
  },
  {
    id: "lf-sticker-oneway-outdoor", name: "LF Sticker Oneway Outdoor", category: "LF Sticker",
    price: 150000, priceBasis: "sqm", unitLabel: "/m²", widths: [1, 1.5], billingIncrement: 0.1,
    note: "Minimum 1×1 m. Panjang dibulatkan ke atas per 10 cm.", finishing: FIXED_SIZE_CUT_FINISHING
  },
  {
    id: "lf-sticker-oneway-hires", name: "LF Sticker Oneway HI-RES", category: "LF Sticker",
    price: 225000, priceBasis: "sqm", unitLabel: "/m²", widths: [1, 1.5], billingIncrement: 0.1,
    note: "Minimum 1×1 m. Panjang dibulatkan ke atas per 10 cm.", finishing: FIXED_SIZE_CUT_FINISHING
  },
  {
    id: "display-mockup", name: "Mockup", category: "Display & Banner", groupedProduct: true,
    price: 100000, priceBasis: "unit", unitLabel: "/pcs", unitName: "pcs",
    note: "Pilih ukuran dan satu jenis bahan.",
    fixedSizeVariants: [
      { id: "30x40", label: "30 × 40 cm", price: 100000 }, { id: "40x60", label: "40 × 60 cm", price: 185000 },
      { id: "60x80", label: "60 × 80 cm", price: 245000 }, { id: "60x120", label: "60 × 120 cm", price: 325000 },
      { id: "60x160", label: "60 × 160 cm", price: 385000 }
    ],
    choiceGroups: [{ id: "board", label: "Pilih bahan", required: true, options: [{ id: "foamboard", label: "Foamboard", materialId: "mat-foamboard" }, { id: "impraboard", label: "Impraboard", materialId: "mat-impraboard" }] }],
    finishing: []
  },
  {
    id: "display-tripod", name: "Tripod Banner", category: "Display & Banner", groupedProduct: true,
    price: 200000, priceBasis: "unit", unitLabel: "/set", unitName: "set",
    note: "Pilih ukuran, jumlah panel, dan satu jenis bahan.",
    fixedSizeVariants: [
      { id: "30x40-1", label: "30 × 40 cm · 1 pcs", price: 200000, choiceMaterialQuantity: 1 }, { id: "30x40-2", label: "30 × 40 cm · 2 pcs", price: 250000, choiceMaterialQuantity: 2 },
      { id: "40x60-1", label: "40 × 60 cm · 1 pcs", price: 275000, choiceMaterialQuantity: 1 }, { id: "40x60-2", label: "40 × 60 cm · 2 pcs", price: 365000, choiceMaterialQuantity: 2 },
      { id: "60x80-1", label: "60 × 80 cm · 1 pcs", price: 325000, choiceMaterialQuantity: 1 }, { id: "60x80-2", label: "60 × 80 cm · 2 pcs", price: 450000, choiceMaterialQuantity: 2 },
      { id: "60x120-1", label: "60 × 120 cm · 1 pcs", price: 425000, choiceMaterialQuantity: 1 }, { id: "60x120-2", label: "60 × 120 cm · 2 pcs", price: 585000, choiceMaterialQuantity: 2 },
      { id: "60x160-1", label: "60 × 160 cm · 1 pcs", price: 485000, choiceMaterialQuantity: 1 }, { id: "60x160-2", label: "60 × 160 cm · 2 pcs", price: 675000, choiceMaterialQuantity: 2 }
    ],
    choiceGroups: [{ id: "board", label: "Pilih bahan", required: true, options: [{ id: "foamboard", label: "Foamboard", materialId: "mat-foamboard" }, { id: "impraboard", label: "Impraboard", materialId: "mat-impraboard" }] }],
    finishing: [{ id: "tripod-clip", name: "Klip Tripod Atas Bawah", price: 20000, rule: "free" }]
  },
  {
    id: "display-roll-banner", name: "Roll Banner", category: "Display & Banner", groupedProduct: true,
    price: 295000, priceBasis: "unit", unitLabel: "/set", unitName: "set", note: "Pilih ukuran dan bahan cetak.",
    fixedSizeVariants: [
      { id: "60x160-albatros", label: "60 × 160 cm · Albatros HI-RES", price: 320000, materialSources: [{ materialId: "mat-roll-banner-60", quantity: 1 }, { materialId: "mat-albatros", quantity: 0.96 }] },
      { id: "60x160-luster", label: "60 × 160 cm · Luster HI-RES", price: 340000, materialSources: [{ materialId: "mat-roll-banner-60", quantity: 1 }, { materialId: "mat-luster", quantity: 0.96 }] },
      { id: "60x160-fl410", label: "60 × 160 cm · FL410 Glossy", price: 295000, materialSources: [{ materialId: "mat-roll-banner-60", quantity: 1 }, { materialId: "mat-flexi-410", quantity: 0.96 }] },
      { id: "85x200-albatros", label: "85 × 200 cm · Albatros HI-RES", price: 430000, materialSources: [{ materialId: "mat-roll-banner-85", quantity: 1 }, { materialId: "mat-albatros", quantity: 1.7 }] },
      { id: "85x200-luster", label: "85 × 200 cm · Luster HI-RES", price: 450000, materialSources: [{ materialId: "mat-roll-banner-85", quantity: 1 }, { materialId: "mat-luster", quantity: 1.7 }] },
      { id: "85x200-fl410", label: "85 × 200 cm · FL410 Glossy", price: 395000, materialSources: [{ materialId: "mat-roll-banner-85", quantity: 1 }, { materialId: "mat-flexi-410", quantity: 1.7 }] }
    ], finishing: []
  },
  {
    id: "display-x-banner", name: "X-Banner", category: "Display & Banner", groupedProduct: true,
    price: 175000, cardPrice: 175000, priceBasis: "unit", unitLabel: "/set", unitName: "set", note: "Pilih bahan cetak atau ukuran mini.", featured: true, recommendation: "Paket display populer",
    fixedSizeVariants: [
      { id: "albatros", label: "Albatros HI-RES", price: 220000, materialSources: [{ materialId: "mat-xstand", quantity: 1 }, { materialId: "mat-albatros", quantity: 0.8 }] },
      { id: "luster", label: "Luster HI-RES", price: 240000, materialSources: [{ materialId: "mat-xstand", quantity: 1 }, { materialId: "mat-luster", quantity: 0.8 }] },
      { id: "fl410", label: "FL410 Glossy", price: 175000, materialSources: [{ materialId: "mat-xstand", quantity: 1 }, { materialId: "mat-flexi-410", quantity: 0.8 }] },
      { id: "mini", label: "X-Banner Mini · 25 × 40 cm", price: 60000, materialSources: [{ materialId: "mat-mini-xstand", quantity: 1 }] }
    ], finishing: []
  },
  {
    id: "display-standing-banner", name: "Standing Banner", category: "Display & Banner", groupedProduct: true,
    price: 525000, priceBasis: "unit", unitLabel: "/set", unitName: "set", note: "Pilih ukuran, jumlah sisi, dan satu jenis bahan.",
    fixedSizeVariants: [
      { id: "60x80-1", label: "60 × 80 cm · 1 sisi", price: 525000, choiceMaterialQuantity: 1 }, { id: "60x80-2", label: "60 × 80 cm · 2 sisi", price: 650000, choiceMaterialQuantity: 2 },
      { id: "80x120-1", label: "80 × 120 cm · 1 sisi", price: 975000, choiceMaterialQuantity: 1 }, { id: "80x120-2", label: "80 × 120 cm · 2 sisi", price: 1200000, choiceMaterialQuantity: 2 }
    ],
    choiceGroups: [{ id: "board", label: "Pilih bahan", required: true, options: [{ id: "foamboard", label: "Foamboard", materialId: "mat-foamboard" }, { id: "impraboard", label: "Impraboard", materialId: "mat-impraboard" }] }], finishing: []
  },
  {
    id: "display-h-banner", name: "H-Banner 60 × 80", category: "Display & Banner", groupedProduct: true,
    price: 550000, priceBasis: "unit", unitLabel: "/set", unitName: "set", note: "Pilih satu jenis bahan.",
    fixedSizeVariants: [{ id: "60x80", label: "60 × 80 cm", price: 550000, materialSources: [{ materialId: "mat-h-banner", quantity: 1 }] }],
    choiceGroups: [{ id: "board", label: "Pilih bahan", required: true, options: [{ id: "foamboard", label: "Foamboard", materialId: "mat-foamboard" }, { id: "impraboard", label: "Impraboard", materialId: "mat-impraboard" }] }], finishing: []
  },
  {
    id: "display-event-desk", name: "Event Desk Sticker Glossy", category: "Display & Banner", groupedProduct: true,
    price: 1500000, priceBasis: "unit", unitLabel: "/set", unitName: "set", note: "Harga satu set Event Desk dengan sticker glossy.",
    fixedSizeVariants: [{ id: "standard", label: "Event Desk + Sticker Glossy", price: 1500000, materialSources: [{ materialId: "mat-event-desk", quantity: 1 }, { materialId: "mat-sticker-white-glossy", quantity: 1 }] }], finishing: []
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
  { id: "mat-luster", sku: "BHN-LUSTER", name: "Luster", category: "Roll Indoor", unit: "m²", stock: 0, minStock: 0, cost: 0, supplier: "", active: true },
  { id: "mat-canvas", sku: "BHN-CANVAS", name: "Canvas", category: "Roll Indoor", unit: "m²", stock: 0, minStock: 0, cost: 0, supplier: "", active: true },
  { id: "mat-backlite-film", sku: "BHN-BLF", name: "Backlite Film", category: "Sheet Large Format", unit: "m²", stock: 0, minStock: 0, cost: 0, supplier: "", active: true },
  { id: "mat-sticker-transparent", sku: "BHN-STK-TR", name: "Sticker Transparant", category: "Sticker", unit: "m²", stock: 0, minStock: 0, cost: 0, supplier: "", active: true },
  { id: "mat-sticker-white-glossy", sku: "BHN-STK-WG", name: "Sticker White Glossy", category: "Sticker", unit: "m²", stock: 0, minStock: 0, cost: 0, supplier: "", active: true },
  { id: "mat-sticker", sku: "BHN-STK-M", name: "Sticker Vinyl Matte", category: "Sticker", unit: "m²", stock: 67, minStock: 15, cost: 70000, supplier: "Supplier Dummy D", active: true },
  { id: "mat-sticker-sandblast", sku: "BHN-STK-SB", name: "Sticker Sandblast", category: "Sticker", unit: "m²", stock: 0, minStock: 0, cost: 0, supplier: "", active: true },
  { id: "mat-sticker-oneway-outdoor", sku: "BHN-STK-OW-OUT", name: "Sticker Oneway Outdoor", category: "Sticker", unit: "m²", stock: 0, minStock: 0, cost: 0, supplier: "", active: true },
  { id: "mat-sticker-oneway-hires", sku: "BHN-STK-OW-HR", name: "Sticker Oneway HI-RES", category: "Sticker", unit: "m²", stock: 0, minStock: 0, cost: 0, supplier: "", active: true },
  { id: "mat-xstand", sku: "ACC-XBNR", name: "Kaki X-Banner", category: "Aksesori Display", unit: "pcs", stock: 32, minStock: 8, cost: 105000, supplier: "Supplier Dummy E", active: true },
  { id: "mat-roll-banner-60", sku: "ACC-RB60160", name: "Roll Banner 60×160", category: "Aksesori Display", unit: "pcs", stock: 0, minStock: 0, cost: 0, supplier: "", active: true },
  { id: "mat-roll-banner-85", sku: "ACC-RB85200", name: "Roll Banner 85×200", category: "Aksesori Display", unit: "pcs", stock: 0, minStock: 0, cost: 0, supplier: "", active: true },
  { id: "mat-mini-xstand", sku: "ACC-XMINI", name: "Kaki Mini X-Banner", category: "Aksesori Display", unit: "pcs", stock: 0, minStock: 0, cost: 0, supplier: "", active: true },
  { id: "mat-tripod", sku: "ACC-TRIPOD", name: "Tripod Banner", category: "Aksesori Display", unit: "pcs", stock: 0, minStock: 0, cost: 0, supplier: "", active: true },
  { id: "mat-foamboard", sku: "BHN-FOAMBOARD", name: "Foamboard", category: "Board", unit: "lbr", stock: 0, minStock: 0, cost: 0, supplier: "", active: true },
  { id: "mat-impraboard", sku: "BHN-IMPRABOARD", name: "Impraboard", category: "Board", unit: "lbr", stock: 0, minStock: 0, cost: 0, supplier: "", active: true },
  { id: "mat-h-banner", sku: "ACC-HBNR", name: "H-Banner", category: "Aksesori Display", unit: "pcs", stock: 0, minStock: 0, cost: 0, supplier: "", active: true },
  { id: "mat-event-desk", sku: "ACC-EVENTDESK", name: "Event Desk", category: "Aksesori Display", unit: "pcs", stock: 0, minStock: 0, cost: 0, supplier: "", active: true },
  { id: "mat-tripod-clip", sku: "ACC-TRIPOD-CLIP", name: "Klip Tripod", category: "Aksesori Display", unit: "set", stock: 0, minStock: 0, cost: 0, supplier: "", active: true },
  { id: "mat-eyelet", sku: "ACC-EYE", name: "Mata Ayam", category: "Aksesori Finishing", unit: "pcs", stock: 1850, minStock: 300, cost: 175, supplier: "Supplier Dummy E", active: true },
  { id: "mat-card", sku: "KRT-CARD", name: "Kertas Kartu Nama SRA3", category: "Kertas", unit: "lbr", stock: 420, minStock: 80, cost: 2400, supplier: "Supplier Dummy C", active: true }
];

export const MACHINES = [
  { id: "mach-eco", code: "ER-642", name: "Roland Ecosolvent", type: "Large Format Printer", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-allwin", code: "C8i 4 Head", name: "Allwin Outdoor", type: "Large Format Printer", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-digital", code: "Ineo+ C4065", name: "Develop Laser A3+", type: "Digtial Press A3+", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-canon-copy", code: "IR 2930i", name: "Canon Fotocopy", type: "Printer Fotocopy", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-laminating-sun", code: "Sun", name: "Laminating", type: "Finishing", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-laminator", code: "Telson WGK", name: "Mesin Laminasi Roll", type: "Finishing", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-diecut", code: "Telson 4065", name: "Mesin DieCut Flatbed", type: "Finishing", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-cut", code: "Saga 1604 Pro", name: "Mesin Cutting Saga", type: "Finishing", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-seaming", code: "FR 900H", name: "Mesin Seaming", type: "Finishing", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-eyelet", code: "Sun", name: "Alat Mata Ayam", type: "Finishing", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-roland-cutting", code: "GR 540", name: "Roland Cutting Plotter", type: "Finishing", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-ring-binding", code: "Grakitec CW2016R", name: "Jilid Ring", type: "Finishing", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-canon-plotter", code: "TM 5350", name: "Canon Plotter", type: "Large Format Printer", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-dtf", code: "Riecat Alfa G0", name: "Printer DTF", type: "DTF Printer", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-pin", code: "Sun", name: "Pin Maker", type: "Finishing", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-mug", code: "Sun", name: "Press Mug Tumbler", type: "Finishing", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-sublim", code: "Epson SC F130", name: "Printer Sublim", type: "Small Printer", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-paper-trimmer", code: "Innovatec 4909", name: "Paper Trimmer", type: "Finishing", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-creasing-telson", code: "WHY", name: "Mesin Creasing Telson", type: "Finishing", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-creasing-sun", code: "YTH 500", name: "SUN Creasing Cutting", type: "Finishing", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-stamp", code: "BSP Morris", name: "Stempel", type: "Stempel Maker", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-photo", code: "Epson L18050", name: "Printer Foto", type: "Small Printer", status: "AKTIF", costPerHour: 0, capacity: "", active: true },
  { id: "mach-receipt", code: "Epson L5290", name: "Printer Nota", type: "Small Printer", status: "AKTIF", costPerHour: 0, capacity: "", active: true }
];

export const FINISHINGS = [
  { id: "fin-out-cut", code: "FIN-OUT-01", name: "Potong Pas Gambar", categories: ["Outdoor", "LF Poster", "LF Sticker"], price: 0, rule: "free", active: true },
  { id: "fin-out-extra", code: "FIN-OUT-02", name: "Lebihan 5 cm", categories: ["Outdoor"], price: 0, rule: "free", active: true },
  { id: "fin-out-seaming", code: "FIN-OUT-03", name: "Seaming Lem", categories: ["Outdoor"], price: 2500, rule: "perimeter", active: true },
  { id: "fin-out-eyelet", code: "FIN-OUT-04", name: "Ring Mata Ayam", categories: ["Outdoor", "LF Poster", "Display & Banner"], price: 500, rule: "point", active: true },
  { id: "fin-out-join", code: "FIN-OUT-05", name: "Sambung Bahan", categories: ["Outdoor"], price: 10000, rule: "length", active: true },
  { id: "fin-out-sleeve-tb", code: "FIN-OUT-06", name: "Selongsong Atas–Bawah", categories: ["Outdoor"], price: 10000, rule: "top_bottom", active: true },
  { id: "fin-out-sleeve-lr", code: "FIN-OUT-07", name: "Selongsong Kanan–Kiri", categories: ["Outdoor"], price: 10000, rule: "left_right", active: true },
  { id: "fin-lf-extra", code: "FIN-LF-EXTRA", name: "Lebihan", categories: ["LF Poster", "LF Sticker"], price: 0, rule: "free", active: true },
  { id: "fin-lf-manual", code: "FIN-LF-MANUAL", name: "Cutting Manual LF", categories: ["LF Poster", "LF Sticker"], price: 45000, rule: "area", active: true },
  { id: "fin-lf-kiss", code: "FIN-LFS-01", name: "Kisscut LF", categories: ["LF Sticker"], price: 45000, rule: "area", active: true },
  { id: "fin-lf-transfer", code: "FIN-LFS-02", name: "Transfer Sticker", categories: ["LF Sticker"], price: 30000, rule: "area", active: true },
  { id: "fin-lf-lam-gloss", code: "FIN-LF-03", name: "Laminasi Glossy", categories: ["LF Sticker", "LF Poster", "Display & Banner"], price: 30000, rule: "free", active: true },
  { id: "fin-lf-lam-matte", code: "FIN-LF-04", name: "Laminasi Doff", categories: ["LF Sticker", "LF Poster", "Display & Banner"], price: 35000, rule: "free", active: true },
  { id: "fin-lf-double-tape", code: "FIN-LFP-01", name: "Double Tape", categories: ["LF Poster"], price: 5000, rule: "free", active: true },
  { id: "fin-a3-two-side", code: "FIN-A3-01", name: "Cetak 2 Sisi", categories: ["Print A3+", "ATK"], price: 2500, rule: "free", active: true },
  { id: "fin-a3-manual", code: "FIN-A3-02", name: "Cutting Manual", categories: ["Print A3+", "ATK"], price: 500, rule: "free", active: true },
  { id: "fin-a3-diecut", code: "FIN-A3-03", name: "Die Cut", categories: ["Print A3+", "ATK"], price: 1500, rule: "free", active: true },
  { id: "fin-a3-perforation", code: "FIN-A3-04", name: "Perforasi", categories: ["Print A3+", "ATK"], price: 1000, rule: "free", active: true },
  { id: "fin-a3-lam-gloss-1", code: "FIN-A3-05", name: "Laminasi Glossy 1 Sisi", categories: ["Print A3+", "ATK"], price: 3000, rule: "free", active: true },
  { id: "fin-a3-lam-matte-1", code: "FIN-A3-06", name: "Laminasi Doff 1 Sisi", categories: ["Print A3+", "ATK"], price: 3500, rule: "free", active: true },
  { id: "fin-a3-lam-gloss-2", code: "FIN-A3-07", name: "Laminasi Glossy 2 Sisi", categories: ["Print A3+", "ATK"], price: 5500, rule: "free", active: true },
  { id: "fin-a3-lam-matte-2", code: "FIN-A3-08", name: "Laminasi Doff 2 Sisi", categories: ["Print A3+", "ATK"], price: 6500, rule: "free", active: true },
  { id: "fin-display-bag", code: "FIN-DSP-01", name: "Tas X-Banner", categories: ["Display & Banner"], price: 25000, rule: "free", active: true },
  { id: "fin-display-tripod-clip", code: "FIN-DSP-02", name: "Klip Tripod Atas Bawah", categories: ["Display & Banner"], price: 20000, rule: "free", materialId: "mat-tripod-clip", active: true },
  { id: "fin-rounded", code: "FIN-ATK-01", name: "Sudut Bulat", categories: ["ATK"], price: 10000, rule: "free", active: true }
];

const PRODUCT_META = {
  "fl-280-glossy": { sku: "PRD-FL280", baseCost: 14500, saleUnit: "m²", machineIds: ["mach-eco", "mach-eyelet"], sources: [["mat-flexi-280", 1, 5]] },
  "spanduk-template": { sku: "PRD-SPTEMPLATE", baseCost: 14500, saleUnit: "m²", machineIds: ["mach-eco", "mach-eyelet"], sources: [["mat-flexi-280", 1, 5]] },
  "fl-380-matte": { sku: "PRD-FL380", baseCost: 26000, saleUnit: "m²", machineIds: ["mach-eco", "mach-eyelet"], sources: [["mat-flexi-380", 1, 5]] },
  "fl-410-glossy": { sku: "PRD-FL410", baseCost: 29000, saleUnit: "m²", machineIds: ["mach-eco", "mach-eyelet"], sources: [["mat-flexi-410", 1, 5]] },
  "fl-440-matte": { sku: "PRD-FL440", baseCost: 34000, saleUnit: "m²", machineIds: ["mach-eco", "mach-eyelet"], sources: [["mat-flexi-440", 1, 5]] },
  "cloth-banner": { sku: "PRD-CLOTH", baseCost: 33000, saleUnit: "m lari", machineIds: ["mach-eco"], sources: [["mat-cloth", 1, 5]] },
  "nb-backlite-510": { sku: "PRD-BACK510", baseCost: 68000, saleUnit: "m lari", machineIds: ["mach-eco"], sources: [["mat-backlite", 1, 5]] },
  "art-paper-260": { sku: "PRD-AP260", baseCost: 2100, saleUnit: "lbr", machineIds: ["mach-digital"], sources: [["mat-art260", 1, 2]] },
  "poster-albatros": { sku: "PRD-ALB-M2", baseCost: 42000, saleUnit: "m²", machineIds: ["mach-eco"], sources: [["mat-albatros", 1, 5]] },
  "poster-luster": { sku: "PRD-LUSTER-M2", baseCost: 0, saleUnit: "m²", machineIds: ["mach-eco"], sources: [["mat-luster", 1, 0]] },
  "poster-canvas": { sku: "PRD-CANVAS-M2", baseCost: 0, saleUnit: "m²", machineIds: ["mach-eco"], sources: [["mat-canvas", 1, 0]] },
  "poster-backlite-film": { sku: "PRD-BLF", baseCost: 0, saleUnit: "lbr", machineIds: ["mach-eco"], sources: [["mat-backlite-film", 1, 0]] },
  "lf-sticker-transparent": { sku: "PRD-STK-TR-M2", baseCost: 0, saleUnit: "m²", machineIds: ["mach-eco"], sources: [["mat-sticker-transparent", 1, 0]] },
  "lf-sticker-white-glossy": { sku: "PRD-STK-WG-M2", baseCost: 0, saleUnit: "m²", machineIds: ["mach-eco"], sources: [["mat-sticker-white-glossy", 1, 0]] },
  "lf-sticker-matte": { sku: "PRD-STK-WM-M2", baseCost: 70000, saleUnit: "m²", machineIds: ["mach-eco"], sources: [["mat-sticker", 1, 7]] },
  "lf-sticker-sandblast-print": { sku: "PRD-STK-SB-C", baseCost: 0, saleUnit: "m²", machineIds: ["mach-eco"], sources: [["mat-sticker-sandblast", 1, 0]] },
  "lf-sticker-sandblast-plain": { sku: "PRD-STK-SB-NC", baseCost: 0, saleUnit: "m²", machineIds: [], sources: [["mat-sticker-sandblast", 1, 0]] },
  "lf-sticker-oneway-outdoor": { sku: "PRD-STK-OW-OUT", baseCost: 0, saleUnit: "m²", machineIds: ["mach-allwin"], sources: [["mat-sticker-oneway-outdoor", 1, 0]] },
  "lf-sticker-oneway-hires": { sku: "PRD-STK-OW-HR", baseCost: 0, saleUnit: "m²", machineIds: ["mach-eco"], sources: [["mat-sticker-oneway-hires", 1, 0]] },
  "display-mockup": { sku: "PRD-DSP-MOCKUP", baseCost: 0, saleUnit: "pcs", machineIds: ["mach-eco"], sources: [] },
  "display-tripod": { sku: "PRD-DSP-TRIPOD", baseCost: 0, saleUnit: "set", machineIds: ["mach-eco"], sources: [["mat-tripod", 1, 0]] },
  "display-roll-banner": { sku: "PRD-DSP-ROLL", baseCost: 0, saleUnit: "set", machineIds: ["mach-eco"], sources: [] },
  "display-x-banner": { sku: "PRD-DSP-XBNR", baseCost: 0, saleUnit: "set", machineIds: ["mach-eco"], sources: [] },
  "display-standing-banner": { sku: "PRD-DSP-STANDING", baseCost: 0, saleUnit: "set", machineIds: ["mach-eco"], sources: [] },
  "display-h-banner": { sku: "PRD-DSP-HBNR", baseCost: 0, saleUnit: "set", machineIds: ["mach-eco"], sources: [] },
  "display-event-desk": { sku: "PRD-DSP-EVENT", baseCost: 0, saleUnit: "set", machineIds: ["mach-eco"], sources: [] },
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

function finishingIdFor(finish, category, finishings = FINISHINGS) {
  const direct = finishings.find((item) => item.name === finish.name && item.categories.includes(category));
  if (direct) return direct.id;
  if (["Print A3+", "ATK"].includes(category) && finish.name === "Laminasi Glossy") return "fin-a3-lam-gloss-1";
  if (["Print A3+", "ATK"].includes(category) && finish.name === "Laminasi Doff") return "fin-a3-lam-matte-1";
  if (["Print A3+", "ATK"].includes(category) && ["Potong Jadi", "Cutting Manual"].includes(finish.name)) return "fin-a3-manual";
  if (category === "LF Sticker" && finish.name === "Contour Cut") return "fin-lf-kiss";
  return null;
}

function seededProducts() {
  return PRODUCTS.map((product) => {
    const meta = PRODUCT_META[product.id] || {};
    const finishingIds = product.finishing.map((finish) => finishingIdFor(finish, product.category)).filter(Boolean);
    return {
      ...structuredClone(product), sku: meta.sku || product.id.toUpperCase(), baseCost: meta.baseCost || 0,
      saleUnit: meta.saleUnit || product.unitName || "pcs", active: true, machineIds: meta.machineIds || [],
      materialSources: (meta.sources || []).map(([materialId, quantity, wastePercent]) => ({ materialId, quantity, wastePercent })), finishingIds,
      discount: meta.discount || { enabled: false, type: "percent", value: 0, startsAt: "", endsAt: "" },
      ...defaultTiers(product, Boolean(meta.wholesale))
    };
  });
}

function hydrateProduct(product, materials, finishings) {
  const fallback = seededProducts().find((item) => item.id === product.id) || {};
  const merged = { active: true, widths: [], finishing: [], machineIds: [], materialSources: [], ...fallback, ...product };
  const hydrateSource = (source) => {
    const material = materials.find((item) => item.id === source.materialId);
    return { ...source, sku: material?.sku || source.sku, name: material?.name || source.name, unit: material?.unit || source.unit };
  };
  merged.materialSources = (merged.materialSources || []).map(hydrateSource);
  merged.fixedSizeVariants = (merged.fixedSizeVariants || []).map((variant) => ({ ...variant, materialSources: (variant.materialSources || []).map(hydrateSource) }));
  merged.choiceGroups = (merged.choiceGroups || []).map((group) => ({ ...group, options: (group.options || []).map((option) => option.materialId ? hydrateSource({ ...option, quantity: Number(option.quantity || 1), wastePercent: 0 }) : option) }));
  if (!merged.finishingIds?.length) {
    merged.finishingIds = (merged.finishing || []).map((finish) => finishingIdFor(finish, merged.category, finishings)).filter(Boolean);
  }
  if (merged.finishingIds.length) merged.finishing = merged.finishingIds.map((id) => finishings.find((item) => item.id === id)).filter((item) => item && item.active !== false && item.categories.includes(merged.category)).map((item) => structuredClone(item));
  merged.discount ||= { enabled: false, type: "percent", value: 0, startsAt: "", endsAt: "" };
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
  const previousCatalogVersion = Number(state.catalogVersion || 0);
  state.materials ||= structuredClone(MATERIALS);
  state.machines ||= structuredClone(MACHINES);
  state.finishings ||= structuredClone(FINISHINGS);
  if (previousCatalogVersion < 5) {
    for (const seeded of MATERIALS) {
      if (!state.materials.some((item) => item.id === seeded.id)) state.materials.push(structuredClone(seeded));
    }
    state.machines = structuredClone(MACHINES);
    const lfFinishingIds = new Set(["fin-out-cut", "fin-out-eyelet", "fin-lf-extra", "fin-lf-manual", "fin-lf-kiss", "fin-lf-transfer"]);
    for (const seeded of FINISHINGS.filter((item) => lfFinishingIds.has(item.id))) {
      const current = state.finishings.find((item) => item.id === seeded.id);
      if (current) Object.assign(current, structuredClone(seeded)); else state.finishings.push(structuredClone(seeded));
    }
  }
  if (previousCatalogVersion < 7) {
    for (const seeded of MATERIALS) {
      if (!state.materials.some((item) => item.id === seeded.id)) state.materials.push(structuredClone(seeded));
    }
    const displayFinishing = FINISHINGS.find((item) => item.id === "fin-display-tripod-clip");
    const currentFinishing = state.finishings.find((item) => item.id === displayFinishing.id);
    if (currentFinishing) Object.assign(currentFinishing, structuredClone(displayFinishing)); else state.finishings.push(structuredClone(displayFinishing));
  }
  state.products = (state.products?.length ? state.products : seededProducts()).map((product) => hydrateProduct(product, state.materials, state.finishings));
  if (previousCatalogVersion < 2) {
    const previousInventory = state.inventory || [];
    state.inventory = inventoryRows(state.materials).map((row) => {
      const current = previousInventory.find((item) => item.sku === row.sku);
      return current ? { ...row, quantity: Number(current.quantity || row.quantity), updatedAt: current.updatedAt || row.updatedAt } : row;
    });
  } else {
    state.inventory ||= [];
    for (const row of inventoryRows(state.materials)) {
      const current = state.inventory.find((item) => item.sku === row.sku);
      if (!current) state.inventory.push(row);
      else Object.assign(current, { materialId: row.materialId, productName: row.productName, minStock: row.minStock, unit: row.unit });
    }
  }
  if (previousCatalogVersion < 3) {
    const promoProduct = state.products.find((item) => item.id === "x-banner-albatros");
    if (promoProduct && !promoProduct.discount?.enabled) promoProduct.discount = { enabled: true, type: "percent", value: 10, startsAt: "", endsAt: "" };
  }
  if (previousCatalogVersion < 4 && !state.products.some((item) => item.id === "spanduk-template")) {
    const templateProduct = seededProducts().find((item) => item.id === "spanduk-template");
    if (templateProduct) state.products.push(hydrateProduct(templateProduct, state.materials, state.finishings));
  }
  if (previousCatalogVersion < 5) {
    const lfProducts = seededProducts().filter((item) => ["LF Poster", "LF Sticker"].includes(item.category));
    for (const seeded of lfProducts) {
      const product = state.products.find((item) => item.id === seeded.id);
      const hydrated = hydrateProduct(seeded, state.materials, state.finishings);
      if (product) Object.assign(product, hydrated); else state.products.push(hydrated);
    }
  }
  if (previousCatalogVersion < 6) {
    const mergedVariantIds = new Set([
      "poster-albatros-a1", "poster-luster-a1",
      "poster-backlite-a4", "poster-backlite-a3", "poster-backlite-a2", "poster-backlite-a1",
      "lf-sticker-transparent-a1", "lf-sticker-white-glossy-a1", "lf-sticker-white-matte-a1"
    ]);
    state.products = state.products.filter((item) => !mergedVariantIds.has(item.id));
    const variantProducts = seededProducts().filter((item) => [
      "poster-albatros", "poster-luster", "poster-backlite-film",
      "lf-sticker-transparent", "lf-sticker-white-glossy", "lf-sticker-matte"
    ].includes(item.id));
    for (const seeded of variantProducts) {
      const product = state.products.find((item) => item.id === seeded.id);
      const hydrated = hydrateProduct(seeded, state.materials, state.finishings);
      if (product) Object.assign(product, hydrated); else state.products.push(hydrated);
    }
  }
  if (previousCatalogVersion < 7) {
    state.products = state.products.filter((item) => item.id !== "x-banner-albatros");
    const displayProducts = seededProducts().filter((item) => item.category === "Display & Banner");
    for (const seeded of displayProducts) {
      const product = state.products.find((item) => item.id === seeded.id);
      const hydrated = hydrateProduct(seeded, state.materials, state.finishings);
      if (product) Object.assign(product, hydrated); else state.products.push(hydrated);
    }
  }
  state.catalogVersion = 7;
  return state;
}

export function seedState() {
  const materials = structuredClone(MATERIALS);
  const inventory = inventoryRows(materials);
  return {
    products: seededProducts(),
    materials,
    machines: structuredClone(MACHINES),
    finishings: structuredClone(FINISHINGS),
    inventory,
    orders: [],
    activities: [],
    stockMovements: [],
    nextOrderNumber: 1,
    catalogVersion: 7
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
