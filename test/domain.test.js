import test from "node:test";
import assert from "node:assert/strict";
import { roundBillingLength, calculateLine, allowedNextStatus, STATUS, tierPriceForQuantity, isDiscountActive, discountedPrice } from "../lib/domain.js";
import { PRODUCTS, MACHINES, MATERIALS } from "../lib/store.js";

test("panjang ditagihkan dibulatkan per 50 cm dengan minimum 1 m", () => {
  assert.equal(roundBillingLength(0.4), 1);
  assert.equal(roundBillingLength(1.2), 1.5);
  assert.equal(roundBillingLength(2), 2);
});

test("LF Poster dan LF Sticker dibulatkan ke atas per 10 cm", () => {
  assert.equal(roundBillingLength(0.4, 0.1), 1);
  assert.equal(roundBillingLength(1.01, 0.1), 1.1);
  assert.equal(roundBillingLength(1.1, 0.1), 1.1);
  const poster = PRODUCTS.find((item) => item.id === "poster-albatros");
  const line = calculateLine(poster, { width: 0.9, length: 1.01, quantity: 1, finishing: [] });
  assert.equal(line.billedLength, 1.1);
  assert.equal(line.baseTotal, 148500);
});

test("finishing LF per m² mengikuti luas yang ditagihkan", () => {
  const sticker = PRODUCTS.find((item) => item.id === "lf-sticker-white-glossy");
  const line = calculateLine(sticker, { width: 1.5, length: 1.01, quantity: 2, finishing: [{ id: "manual-cut-lf", units: 1 }] });
  assert.equal(line.billedLength, 1.1);
  assert.equal(line.finishing[0].units, 3.3);
  assert.equal(line.finishingTotal, 148500);
});

test("Kisscut LF memiliki quantity manual minimal satu", () => {
  const sticker = PRODUCTS.find((item) => item.id === "lf-sticker-white-glossy");
  const minimum = calculateLine(sticker, { width: 1, length: 1, quantity: 1, finishing: [{ id: "kisscut", units: 0.5 }] });
  const manual = calculateLine(sticker, { width: 1, length: 1, quantity: 1, finishing: [{ id: "kisscut", units: 2.5 }] });
  assert.equal(minimum.finishing[0].units, 1);
  assert.equal(minimum.finishingTotal, 45000);
  assert.equal(manual.finishing[0].units, 2.5);
  assert.equal(manual.finishingTotal, 112500);
});

test("varian A1 memakai harga tetap dan hanya quantity", () => {
  const albatros = PRODUCTS.find((item) => item.id === "poster-albatros");
  const line = calculateLine(albatros, { sizeVariantId: "a1", quantity: 2, fileServiceId: "READY", finishing: [] });
  assert.equal(line.baseTotal, 200000);
  assert.equal(line.displaySize, "A1 · 2 Lbr");
  assert.equal(line.stockConsumption, 1);
});

test("Backlite Film memakai satu produk dengan empat varian ukuran", () => {
  const backlite = PRODUCTS.find((item) => item.id === "poster-backlite-film");
  assert.deepEqual(backlite.fixedSizeVariants.map((item) => item.label), ["A4", "A3", "A2", "A1"]);
  const line = calculateLine(backlite, { sizeVariantId: "a2", quantity: 3, fileServiceId: "READY", finishing: [] });
  assert.equal(line.baseTotal, 450000);
  assert.equal(line.displaySize, "A2 · 3 Lbr");
});

test("Display & Banner memakai tujuh produk induk dengan varian harga tetap", () => {
  const products = PRODUCTS.filter((item) => item.category === "Display & Banner");
  assert.equal(products.length, 7);
  assert.ok(products.every((item) => item.groupedProduct));
  assert.equal(products.find((item) => item.id === "display-tripod").fixedSizeVariants.length, 10);
  assert.equal(products.find((item) => item.id === "display-roll-banner").fixedSizeVariants.length, 6);
});

test("pilihan Foamboard dan Impraboard wajib tunggal", () => {
  const mockup = PRODUCTS.find((item) => item.id === "display-mockup");
  assert.throws(() => calculateLine(mockup, { sizeVariantId: "30x40", quantity: 1, choices: [], finishing: [] }), /Pilih bahan/i);
  const line = calculateLine(mockup, { sizeVariantId: "40x60", quantity: 2, choices: [{ groupId: "board", optionId: "impraboard" }], finishing: [] });
  assert.equal(line.baseTotal, 370000);
  assert.match(line.displaySize, /Impraboard/);
  assert.equal(line.materials[0].materialId, "mat-impraboard");
  assert.equal(line.materials[0].units, 2);
});

test("Tripod menghitung varian dan add-on klip", () => {
  const tripod = PRODUCTS.find((item) => item.id === "display-tripod");
  const line = calculateLine(tripod, { sizeVariantId: "60x120-2", quantity: 1, choices: [{ groupId: "board", optionId: "foamboard" }], finishing: [{ id: "tripod-clip", units: 1 }] });
  assert.equal(line.baseTotal, 585000);
  assert.equal(line.finishingTotal, 20000);
  assert.equal(line.subtotal, 605000);
  assert.equal(line.materials.find((item) => item.materialId === "mat-foamboard").units, 2);
});

test("database bahan memuat sepuluh komponen Display & Banner", () => {
  const names = ["Kaki X-Banner", "Roll Banner 60×160", "Roll Banner 85×200", "Kaki Mini X-Banner", "Tripod Banner", "Foamboard", "Impraboard", "H-Banner", "Event Desk", "Klip Tripod"];
  const materialNames = new Set(MATERIALS.map((item) => item.name));
  assert.ok(names.every((name) => materialNames.has(name)));
});

test("katalog spreadsheet memuat produk LF dan 23 mesin", () => {
  assert.equal(PRODUCTS.filter((item) => item.category === "LF Poster").length, 4);
  assert.equal(PRODUCTS.filter((item) => item.category === "LF Sticker").length, 7);
  assert.equal(MACHINES.length, 23);
  assert.equal(MACHINES.find((item) => item.name === "Allwin Outdoor")?.code, "C8i 4 Head");
});

test("FL 280 menghitung luas dan mata ayam", () => {
  const product = PRODUCTS.find((item) => item.id === "fl-280-glossy");
  const line = calculateLine(product, { width: 1, length: 1.2, quantity: 1, finishing: [{ id: "eyelets", units: 4 }] });
  assert.equal(line.billedLength, 1.5);
  assert.equal(line.baseTotal, 45000);
  assert.equal(line.finishingTotal, 2000);
  assert.equal(line.subtotal, 47000);
  assert.equal(line.stockConsumption, 1.5);
});

test("status hanya bergerak satu langkah", () => {
  assert.equal(allowedNextStatus(STATUS.WAITING_PAYMENT), STATUS.DESIGN);
  assert.equal(allowedNextStatus(STATUS.FINISHING), STATUS.DONE);
  assert.equal(allowedNextStatus(STATUS.PICKED_UP), null);
});

test("quantity finishing mengikuti input kasir dan tidak dikali qty produk", () => {
  const product = PRODUCTS.find((item) => item.id === "fl-280-glossy");
  const line = calculateLine(product, {
    width: 1, length: 1, quantity: 3,
    finishing: [{ id: "seaming", units: 4 }],
    productionNote: "Tiga file berbeda"
  });
  assert.equal(line.baseTotal, 90000);
  assert.equal(line.finishingTotal, 10000);
  assert.equal(line.productionNote, "Tiga file berbeda");
});

test("produk satuan menghitung quantity dan finishing masing-masing", () => {
  const product = {
    id: "card", name: "Kartu Nama", price: 75000, priceBasis: "unit", unitName: "box",
    finishing: [{ id: "lam", name: "Laminasi", price: 20000, rule: "free" }]
  };
  const line = calculateLine(product, { quantity: 2, finishing: [{ id: "lam", units: 2 }] });
  assert.equal(line.baseTotal, 150000);
  assert.equal(line.finishingTotal, 40000);
  assert.equal(line.subtotal, 190000);
  assert.equal(line.stockSku, "card-unit");
  assert.equal(line.stockConsumption, 2);
  assert.equal(line.displaySize, "2 box");
});

test("harga grosir memilih tingkat berdasarkan quantity", () => {
  const product = { price: 10000, wholesaleEnabled: true, priceTiers: [{ min: 1, max: 1, price: 10000 }, { min: 2, max: 10, price: 9000 }, { min: 11, max: 50, price: 8000 }] };
  assert.equal(tierPriceForQuantity(product, 1), 10000);
  assert.equal(tierPriceForQuantity(product, 5), 9000);
  assert.equal(tierPriceForQuantity(product, 20), 8000);
  assert.equal(tierPriceForQuantity({ ...product, wholesaleEnabled: false }, 20), 10000);
});

test("snapshot BOM menghitung bahan dan waste dari unit jual", () => {
  const line = calculateLine({
    id: "x-banner", name: "X-Banner", price: 10000, priceBasis: "unit", unitName: "set", widths: [], finishing: [],
    materialSources: [{ materialId: "albatros", sku: "BHN-ALB", name: "Albatros", unit: "m²", quantity: .8, wastePercent: 5 }, { materialId: "stand", sku: "ACC-X", name: "Kaki", unit: "pcs", quantity: 1, wastePercent: 0 }]
  }, { quantity: 2, finishing: [] });
  assert.equal(line.materials[0].units, 1.68);
  assert.equal(line.materials[1].units, 2);
});

test("diskon hanya aktif di dalam periode promo", () => {
  const product = { discount: { enabled: true, type: "percent", value: 10, startsAt: "2026-09-21T08:00:00Z", endsAt: "2026-09-22T08:00:00Z" } };
  assert.equal(isDiscountActive(product, new Date("2026-09-21T12:00:00Z")), true);
  assert.equal(isDiscountActive(product, new Date("2026-09-23T12:00:00Z")), false);
  assert.equal(discountedPrice(product, 10000, new Date("2026-09-21T12:00:00Z")), 9000);
  assert.equal(discountedPrice(product, 10000, new Date("2026-09-23T12:00:00Z")), 10000);
});

test("harga grosir dihitung sebelum diskon produk", () => {
  const product = { id: "promo", name: "Promo", price: 10000, priceBasis: "unit", unitName: "pcs", widths: [], finishing: [], materialSources: [], wholesaleEnabled: true, priceTiers: [{ min: 2, max: 10, price: 9000 }], discount: { enabled: true, type: "percent", value: 10 } };
  const line = calculateLine(product, { quantity: 5, finishing: [] });
  assert.equal(line.originalUnitPrice, 9000);
  assert.equal(line.unitPrice, 8100);
  assert.equal(line.baseTotal, 40500);
  assert.equal(line.discountApplied, true);
});

test("biaya edit file ditambahkan satu kali per item", () => {
  const product = { id: "print", name: "Print", price: 30000, priceBasis: "sqm", widths: [1], finishing: [], materialSources: [] };
  const line = calculateLine(product, { width: 1, length: 1, quantity: 3, fileServiceId: "DESIGN_B", finishing: [] });
  assert.equal(line.baseTotal, 90000);
  assert.equal(line.fileServiceTotal, 35000);
  assert.equal(line.subtotal, 125000);
});

test("spanduk template memakai ukuran dan kode design yang tersedia", () => {
  const product = {
    id: "spanduk-template", name: "Spanduk Template", price: 30000, priceBasis: "sqm", widths: [1.5, 2, 3],
    templateProduct: true, templateDesignPrice: 35000, sizeVariants: [{ width: 2, length: 1.5 }], designTemplates: ["SB-01"], finishing: [], materialSources: []
  };
  const line = calculateLine(product, { width: 2, length: 1.5, quantity: 1, templateDesign: "SB-01", fileServiceId: "DESIGN_D", finishing: [] });
  assert.equal(line.baseTotal, 90000);
  assert.equal(line.templateDesignTotal, 35000);
  assert.equal(line.fileServiceTotal, 0);
  assert.equal(line.subtotal, 125000);
  assert.equal(line.templateDesign, "SB-01");
  assert.match(line.displaySize, /SB-01/);
});

test("catatan finishing tersimpan pada finishing yang dipilih", () => {
  const product = {
    id: "banner", name: "Banner", price: 30000, priceBasis: "sqm", widths: [1], materialSources: [],
    finishing: [{ id: "eyelets", name: "Mata Ayam", price: 500, rule: "point" }]
  };
  const line = calculateLine(product, { width: 1, length: 1, quantity: 1, finishing: [{ id: "eyelets", units: 4, note: "Jarak tiap 50 cm" }] });
  assert.equal(line.finishing[0].note, "Jarak tiap 50 cm");
  assert.equal(line.finishing[0].subtotal, 2000);
});
