import test from "node:test";
import assert from "node:assert/strict";
import { initializeCatalogSettings, categoryKey, addCategory, renameCategory, deleteCategory, reorderCategories, savePic, deletePic } from "../lib/catalog-settings.js";

function fixture() {
  const state = {
    catalogOptions: { categories: ["Print A3+", "ATK", "Outdoor"] },
    products: [{ id: "paper", category: "Print A3+", a3Kind: "paper", price: 4000 }, { id: "archived", category: "Print A3+", deletedAt: "old" }],
    finishings: [{ categories: ["Print A3+", "ATK"] }],
    materials: [{ category: "Kertas" }, { category: "Kaos Polos DTF" }], inventory: [{ category: "Kertas", quantity: 50 }],
    orders: [{ status: "DESAIN", designPic: "Gema", items: [{ price: 4000 }] }, { status: "SELESAI", designPic: "Gema", items: [{ price: 4000 }] }]
  };
  initializeCatalogSettings(state); return state;
}

test("rename kategori menjaga identitas konfigurasi khusus dan semua hubungan produk", () => {
  const state = fixture();
  renameCategory(state, "products", "Print A3+", "Cetak A3");
  assert.equal(categoryKey(state.catalogOptions, "Cetak A3"), "print-a3");
  assert.ok(state.products.every((item) => item.category === "Cetak A3"));
  assert.deepEqual(state.finishings[0].categories, ["Cetak A3", "ATK"]);
  assert.equal(state.products[0].a3Kind, "paper");
  assert.equal(state.products[0].price, 4000);
  initializeCatalogSettings(state);
  assert.ok(!state.catalogOptions.categories.includes("Print A3+"));
  assert.equal(categoryKey(state.catalogOptions, "Cetak A3"), "print-a3");
});

test("kategori bahan memperbarui bahan dan stok tanpa mengubah quantity", () => {
  const state = fixture();
  renameCategory(state, "materials", "Kertas", "Kertas Cetak");
  assert.equal(state.materials[0].category, "Kertas Cetak");
  assert.deepEqual(state.inventory[0], { category: "Kertas Cetak", quantity: 50 });
  renameCategory(state, "materials", "Kaos Polos DTF", "Stok Kaos");
  assert.equal(categoryKey(state.catalogOptions, "Stok Kaos", "materials"), "kaos-polos-dtf");
});

test("hapus kategori wajib pengganti dan memindahkan hubungan secara lengkap", () => {
  const state = fixture();
  assert.throws(() => deleteCategory(state, "products", "Print A3+", ""), /pengganti/);
  assert.throws(() => deleteCategory(state, "products", "Print A3+", "Print A3+"), /pengganti/);
  deleteCategory(state, "products", "Print A3+", "ATK");
  assert.ok(state.products.every((item) => item.category === "ATK"));
  assert.deepEqual(state.finishings[0].categories, ["ATK"]);
  assert.ok(!state.catalogOptions.categories.includes("Print A3+"));
  deleteCategory(state, "materials", "Kertas", "Lainnya");
  initializeCatalogSettings(state);
  assert.ok(!state.catalogOptions.materialCategories.includes("Kertas"));
  assert.equal(state.inventory[0].quantity, 50);
});

test("urutan tab mempertahankan seluruh kategori dan nama baru memiliki identitas tersendiri", () => {
  const state = fixture();
  addCategory(state, "products", "Kategori Baru");
  const key = categoryKey(state.catalogOptions, "Kategori Baru");
  assert.ok(key.startsWith("cat-"));
  assert.throws(() => addCategory(state, "products", "kategori baru"), /sudah tersedia/);
  assert.throws(() => reorderCategories(state, ["ATK"]), /berubah/);
  const reversed = [...state.catalogOptions.categories].reverse();
  reorderCategories(state, reversed); initializeCatalogSettings(state);
  assert.deepEqual(state.catalogOptions.categories, reversed);
});

test("PIC mandiri memperbarui pekerjaan berjalan dan menjaga nama historis setelah rename/hapus", () => {
  const state = fixture();
  const pic = state.pics.find((item) => item.name === "Gema");
  assert.equal(state.orders[0].designPicId, pic.id);
  savePic(state, "Gema Baru", pic.id);
  assert.equal(state.orders[0].designPic, "Gema Baru");
  assert.equal(state.orders[1].designPic, "Gema");
  deletePic(state, pic.id); initializeCatalogSettings(state);
  assert.equal(state.orders[0].designPic, "Gema Baru");
  assert.equal(pic.active, false);
  assert.equal(state.pics.filter((item) => !item.deletedAt).length, 2);
  assert.throws(() => savePic(state, "Lagi", pic.id), /tidak ditemukan/);
});
