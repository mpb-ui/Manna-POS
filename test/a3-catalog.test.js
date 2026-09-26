import test from "node:test";
import assert from "node:assert/strict";
import { A3_CATALOG_PRODUCTS } from "../lib/a3-catalog.js";
import { Store, seedState } from "../lib/store.js";
import { calculateLine } from "../lib/domain.js";

test("katalog A3+ memiliki keluarga kertas A–Z dan sticker tanpa dua sisi", () => {
  const paper = A3_CATALOG_PRODUCTS.filter((item) => item.a3Kind === "paper");
  const stickers = A3_CATALOG_PRODUCTS.filter((item) => item.a3Kind === "sticker");
  assert.equal(new Set(paper.map((item) => item.a3Family)).size, 13);
  assert.equal(stickers.length, 11);
  assert.ok(stickers.every((item) => !item.a3Side && item.finishingIds.every((id) => id.startsWith("fin-a3-sticker-"))));
  assert.equal(new Set(A3_CATALOG_PRODUCTS.map((item) => item.id)).size, A3_CATALOG_PRODUCTS.length);
  assert.ok(paper.some((item) => item.a3Variant === "AP 230" && item.a3Side === "1S"));
  assert.ok(!paper.some((item) => item.a3Variant === "AP 230" && item.a3Side === "2S"));
});

test("harga dan quantity finishing A3+ dihitung oleh server per SKU", () => {
  const state = seedState();
  const hvs = state.products.find((item) => item.a3Family === "HVS" && item.a3Side === "2S");
  const paper = state.products.find((item) => item.a3Variant === "AP 210" && item.a3Side === "1S");
  const sticker = state.products.find((item) => item.a3Kind === "sticker" && item.a3Variant === "White Glossy");
  const hydrated = (item) => ({ ...item, finishing: item.finishingIds.map((id) => state.finishings.find((finish) => finish.id === id)) });
  assert.equal(calculateLine(hydrated(hvs), { quantity: 2, finishing: [] }).baseTotal, 16000);
  const paperLine = calculateLine(hydrated(paper), { quantity: 10, finishing: [{ id: "fin-a3-laminating-a4", units: 3 }] });
  assert.equal(paperLine.baseTotal, 90000);
  assert.equal(paperLine.finishingTotal, 18000);
  const stickerLine = calculateLine(hydrated(sticker), { quantity: 5, finishing: [{ id: "fin-a3-sticker-kisscut", units: 2 }] });
  assert.equal(stickerLine.baseTotal, 87500);
  assert.equal(stickerLine.finishingTotal, 20000);
});

test("migrasi katalog menambahkan SKU tanpa mengubah produk dan harga yang sudah ada", async () => {
  const store = new Store();
  store.memory.catalogVersion = 7;
  store.memory.products = store.memory.products.filter((item) => !item.a3Kind);
  store.memory.finishings = store.memory.finishings.filter((item) => !item.id.startsWith("fin-a3-sticker-") && !item.id.startsWith("fin-a3-laminating-"));
  const legacy = store.memory.products.find((item) => item.id === "art-paper-260");
  legacy.price = 12345;
  const first = await store.read();
  assert.equal(first.products.find((item) => item.id === legacy.id).price, 12345);
  assert.equal(first.products.filter((item) => item.a3Kind).length, A3_CATALOG_PRODUCTS.length);
  assert.ok(first.products.find((item) => item.a3Kind === "sticker").finishing.length);
  await store.mutate(() => {});
  const second = await store.read();
  assert.equal(second.products.length, first.products.length);
  assert.equal(second.finishings.length, first.finishings.length);
});
