import assert from "node:assert/strict";
import test from "node:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { startStockTestServer, stockTestLogin } from "./helpers/stock-scan-server.js";

const executablePath = process.env.TEST_STOCK_SCAN_CHROME;
const output = process.env.TEST_POS_BARCODE_ARTIFACTS;
const ean = "0012345678905";
const upc = "036000291452";
const ean8 = "01234565";
const api = "/api/pos-barcodes";

test("Chromium Barcode POS: registrasi saat OFF, HID global, repricing, dialog, dan cetak A4/A3+", {
  skip: !executablePath, timeout: 90_000
}, async t => {
  const { chromium } = await import(process.env.TEST_STOCK_SCAN_PLAYWRIGHT || "playwright");
  const base = await startStockTestServer(t);
  const owner = await stockTestLogin(base);
  const browser = await chromium.launch({ executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  t.after(() => browser.close());
  if (output) await mkdir(output, { recursive: true });
  const create = async (config, stock) => {
    const product = await owner.ok("/api/products", "POST", { productEditorVersion: 1, saleUnit: "pcs", ...config });
    if (stock) await owner.ok(`/api/inventory/${product.sku}`, "PATCH", { change: stock, reason: "Saldo uji" });
    return product;
  };
  const catalog = product => owner.ok(`${api}/catalog?productId=${product.id}`);
  const register = async (product, code, row = 0) => {
    const { rows } = await catalog(product);
    return owner.ok(api + "/register", "POST", { productId: product.id, targetKey: rows[row].targetKey, code });
  };
  const pen = await create({
    name: "Pulpen Standard Hitam", sku: "ATK-PULPEN-STD-HTM", category: "ATK", retailAtK: true, price: 5000,
    wholesaleEnabled: true, priceTiers: [{ min: 3, max: null, price: 4000 }]
  }, 5);
  await owner.ok("/api/categories/products", "POST", { name: "Frame Foto" });
  const { products } = await owner.ok("/api/bootstrap?view=pos");
  const legacyAcrylic = products.find(product => product.id === "direct-akrilik-display-7x4");
  const frame = await create({
    name: "Frame Foto Meja", sku: "FRAME-FOTO-MEJA", category: "Frame Foto", productKind: "MERCHANDISE",
    price: 35000, hasMaterialVariants: true, variantType: "Varian Ukuran",
    materialVariants: [
      { id: "a5", label: "A5", price: 35000, materialSources: [] },
      { id: "a6", label: "A6", price: 28000, materialSources: [] }
    ]
  }, 8);
  const envelope = await create({ name: "Amplop Cokelat A6", sku: "ATK-AMP-CKL-A6", category: "ATK", retailAtK: true, price: 3000 }, 6);
  await register(frame, upc);
  await register(envelope, ean8);

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [], lookups = [];
  let paymentRequests = 0;
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.pathname === api + "/lookup") lookups.push(url.searchParams.get("code"));
    if (request.method() === "POST" && /\/orders\/[^/]+\/payments$/.test(url.pathname)) paymentRequests++;
  });
  const shot = async filename => {
    if (output) { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: join(output, filename) }); }
  };
  const hid = async (code, enter = "Enter") => {
    for (const char of code) await page.keyboard.press(char);
    await page.keyboard.press(enter);
  };
  const search = page.locator("#product-search");
  const cart = page.locator("#cart-list .cart-item");
  const indicator = page.getByText("Scan Aktif", { exact: true });
  const toast = page.locator("#toast.show");
  const modal = page.getByRole("dialog");
  const nav = view => page.locator(`[data-view="${view}"]`).click();
  const productRow = name => page.locator("tbody tr").filter({ hasText: name });
  await page.goto(base);
  await page.locator("#login-username").fill("admin");
  await page.locator("#login-pin").fill("4321");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await search.waitFor();
  assert.equal(await indicator.count(), 0);
  await hid(upc);
  assert.equal(await cart.count(), 0);
  assert.deepEqual(lookups, []);
  await shot("01-pos-off.png");

  await nav("master");
  await page.locator('[data-master-tab="products"]').click();
  await page.locator("#master-search").fill(pen.name);
  await productRow(pen.name).getByRole("button", { name: "Edit", exact: true }).click();
  const section = modal.locator("[data-product-barcodes]");
  await section.locator("[data-factory-code]").waitFor();
  await section.locator("[data-factory-code]").focus();
  await hid(ean);
  await section.getByText(ean, { exact: true }).waitFor();
  await section.locator("[data-barcode-generate]").click();
  await section.getByText(/^MPP\d{8}$/).waitFor();
  const internal = await section.getByText(/^MPP\d{8}$/).innerText();
  await section.evaluate(element => element.scrollIntoView({ block: "end" }));
  await shot("03-barcode-produk.png");
  await page.keyboard.press("Escape");
  await modal.waitFor({ state: "hidden" });

  const masterTabs = page.getByRole("navigation", { name: "Tab Master Data" });
  const productsTab = masterTabs.getByRole("button", { name: "Produk", exact: true });
  const barcodesTab = masterTabs.getByRole("button", { name: "Registrasi Barcode", exact: true });
  await page.locator("[data-register-barcodes]").click();
  await page.getByRole("heading", { name: "Registrasi Barcode", exact: true }).waitFor();
  assert.equal(await barcodesTab.getAttribute("aria-current"), "page");
  assert.equal(await productsTab.getAttribute("aria-current"), null);
  await productsTab.click();
  await page.getByRole("heading", { name: "Daftar Produk", exact: true }).waitFor();
  assert.equal(await productsTab.getAttribute("aria-current"), "page");
  await barcodesTab.click();
  await page.getByRole("heading", { name: "Registrasi Barcode", exact: true }).waitFor();
  const status = page.getByLabel("Status registrasi");
  const barcodeCategory = page.getByLabel("Kategori produk", { exact: true });
  const barcodeSearch = page.getByRole("searchbox", { name: "Cari nama produk" });
  await barcodeCategory.selectOption("Akrilik");
  await barcodeSearch.fill(legacyAcrylic.name);
  const acrylicRow = productRow(legacyAcrylic.name);
  await acrylicRow.getByRole("button", { name: "Jadikan Barang Dagangan" }).click();
  await acrylicRow.getByRole("button", { name: "Generate Barcode" }).click();
  const acrylicBarcode = await acrylicRow.getByText(/^MPP\d{8}$/).innerText();
  await owner.ok(`/api/inventory/${legacyAcrylic.sku}`, "PATCH", { change: 2, reason: "Saldo uji Akrilik" });

  await barcodeSearch.fill("");
  await barcodeCategory.selectOption("");
  await status.selectOption("registered");
  await productRow(pen.name).waitFor();
  await barcodeCategory.selectOption("Frame Foto");
  const a5 = productRow(frame.name).filter({ hasText: "A5" });
  await a5.waitFor();
  assert.equal(await productRow(pen.name).count(), 0);
  const generateA5 = a5.getByRole("button", { name: "Generate Barcode", exact: true });
  await generateA5.click();
  await a5.getByText(/^MPP\d{8}$/).waitFor();
  assert.equal(await a5.getByText(upc, { exact: true }).isVisible(), true);
  assert.equal(await generateA5.isDisabled(), true);
  await status.selectOption("unregistered");
  await barcodeSearch.fill(frame.name);
  const a6 = productRow(frame.name).filter({ hasText: "A6" });
  await a6.getByRole("button", { name: "Scan Barcode" }).click();
  await modal.locator("[data-factory-code]").waitFor();
  await hid("FRAME-A6-QA");
  await modal.getByText("FRAME-A6-QA", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await barcodeSearch.fill("");
  await barcodeCategory.selectOption("");
  await status.selectOption("registered");
  await a6.getByText("FRAME-A6-QA").waitFor();
  await a6.getByRole("button", { name: "Edit Barcode" }).click();
  await modal.getByRole("button", { name: "Edit", exact: true }).click();
  const entry = modal.locator("[data-factory-code]");
  await entry.fill("FRAME-A6");
  await modal.getByRole("button", { name: "Simpan Barcode" }).click();
  await modal.locator("code").getByText("FRAME-A6", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await shot("04-registrasi-barcode.png");
  for (const name of [pen.name, envelope.name]) await productRow(name).getByRole("checkbox").check();
  await a5.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Cetak Label (3)", exact: true }).click();
  await modal.getByText("3 label · Halaman 1/1").waitFor();
  const printOptions = modal.locator(".barcode-print-options");
  const penLabel = printOptions.locator("section").filter({ hasText: pen.name });
  await penLabel.getByLabel("Jumlah").fill("3");
  await modal.getByText("5 label · Halaman 1/1").waitFor();
  assert.equal(await modal.getByLabel("Tampilkan harga jual").isChecked(), false);
  await modal.getByLabel("Lebar (mm)").fill("20");
  await modal.getByRole("alert").getByText(/Perbesar label/).waitFor();
  assert.equal(await modal.getByRole("button", { name: "Cetak Label", exact: true }).isDisabled(), true);
  await modal.getByLabel("Lebar (mm)").fill("40");
  await modal.getByText("5 label · Halaman 1/1").waitFor();
  await shot("05-pratinjau-label.png");

  // Use the app's rendered print document and intercept only the native print dialog.
  await page.evaluate(() => { window.print = () => {}; });
  const printButton = modal.getByRole("button", { name: "Cetak Label", exact: true });
  await printButton.click();
  await page.locator(".print-document.barcode-a4").waitFor({ state: "attached" });
  assert.equal(await page.locator(".barcode-a4 .barcode-label").count(), 5);
  if (output) await page.pdf({ path: join(output, "qa-label-a4.pdf"), preferCSSPageSize: true, printBackground: true });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await penLabel.getByLabel("Barcode").selectOption(internal);
  await penLabel.getByLabel("Jumlah").fill("100");
  await modal.locator("[name=paper]").selectOption("a3plus");
  await modal.getByLabel("Tampilkan harga jual").check();
  await modal.getByText("102 label · Halaman 1/2").waitFor();
  await printButton.click();
  assert.equal(await page.locator(".barcode-a3plus .barcode-sheet").count(), 2);
  if (output) await page.pdf({ path: join(output, "qa-label-a3plus.pdf"), preferCSSPageSize: true, printBackground: true });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await modal.getByRole("button", { name: "Batal", exact: true }).click();
  await page.locator('[data-master-tab="pos-settings"]').click();
  await page.getByRole("switch", { name: "Barcode Scanner" }).press("Space");
  await toast.getByText("Barcode Scanner POS aktif").waitFor();
  await nav("pos");
  await indicator.waitFor();

  await hid(acrylicBarcode);
  const acrylicLine = cart.filter({ hasText: legacyAcrylic.name });
  await acrylicLine.getByText("1 pcs", { exact: true }).waitFor();
  await acrylicLine.getByRole("button", { name: `Hapus ${legacyAcrylic.name}` }).click();
  await acrylicLine.waitFor({ state: "detached" });

  await hid(ean);
  const penCount = page.getByLabel(`Jumlah ${pen.name}`, { exact: true });
  await penCount.waitFor();
  assert.equal(await penCount.inputValue(), "1");
  await hid(ean);
  await hid(ean);
  await page.waitForFunction(() => document.querySelector("[data-cart-quantity]")?.value === "3");
  assert.equal(await cart.count(), 1);
  assert.match(await cart.first().innerText(), /12\.000/);
  const up = page.getByRole("button", { name: `Tambah jumlah ${pen.name}` });
  const down = page.getByRole("button", { name: `Kurangi jumlah ${pen.name}` });
  await down.click();
  await page.waitForFunction(() => document.querySelector("[data-cart-quantity]")?.value === "2");
  assert.match(await cart.first().innerText(), /10\.000/);
  await up.click();
  await page.waitForFunction(() => document.querySelector("[data-cart-quantity]")?.value === "3");
  await penCount.fill("4");
  await penCount.press("Enter");
  await cart.first().getByText(/16\.000/).waitFor();
  await penCount.fill("6");
  await penCount.press("Tab");
  await toast.getByText(/Stok .* tidak cukup/).waitFor();
  assert.equal(await penCount.inputValue(), "4");
  for (const [code, message] of [["99999999", /tidak ditemukan/], ["MAT:mat-art260", /Stock Scan/], ["CMD:OUT", /Stock Scan/]]) {
    await page.locator("h2").filter({ hasText: "Ringkasan Pesanan" }).click();
    await hid(code);
    await toast.getByText(message).waitFor();
  }
  assert.equal(await cart.count(), 1);

  const outdoor = page.getByRole("tab", { name: /Outdoor/ });
  await outdoor.click();
  await hid(upc);
  await cart.filter({ hasText: frame.name }).getByText(/A5/).waitFor();
  assert.equal(await cart.count(), 2);
  await page.getByRole("tab", { name: "ATK", exact: true }).click();
  await page.keyboard.press("Control+k");
  assert.equal(await search.evaluate(input => input === document.activeElement), true);
  await search.fill(envelope.name);
  await search.press("ArrowDown");
  await search.press("Enter");
  await modal.getByRole("heading", { name: envelope.name, exact: true }).waitFor();
  await modal.locator("#add-item").click();
  await cart.filter({ hasText: envelope.name }).waitFor();
  await search.fill(ean8);
  await search.press("Enter");
  await cart.filter({ hasText: envelope.name }).getByText("2 pcs", { exact: true }).waitFor();
  assert.equal(await page.locator(`[data-flat-quantity="${envelope.id}"]`).inputValue(), "2");
  assert.equal(await cart.count(), 3);
  await page.getByRole("button", { name: `Hapus ${envelope.name}` }).click();
  await cart.filter({ hasText: envelope.name }).waitFor({ state: "detached" });
  await page.locator(`.atk-pick[data-flat-product="${envelope.id}"]`).waitFor();
  await page.getByRole("tab", { name: "Home", exact: true }).click();
  await hid(ean);
  await toast.getByText("Pulpen Standard Hitam ditambahkan · Jumlah 5 pcs").waitFor();
  await shot("02-pos-on.png");
  await toast.waitFor({ state: "hidden" });
  await page.setViewportSize({ width: 390, height: 844 });
  await indicator.waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await shot("06-pos-layar-kecil.png");
  await page.setViewportSize({ width: 1440, height: 900 });

  const lookupCount = lookups.length;
  const customer = page.locator("#checkout-customer-name");
  const phone = page.locator('#checkout [name="phone"]');
  await customer.fill("Pelanggan Uji");
  await phone.fill("081234000011");
  await hid(ean);
  assert.equal(await lookups.length, lookupCount);
  assert.equal(await penCount.inputValue(), "5");
  assert.equal(await page.locator("#checkout").isVisible(), true);
  await phone.fill("081234000011");

  await search.fill("FL 280 Glossy");
  await search.press("Enter");
  await modal.getByRole("heading", { name: "FL 280 Glossy" }).waitFor();
  await modal.locator("#image-width").focus();
  await hid(ean);
  assert.equal(await lookups.length, lookupCount);
  assert.equal(await modal.isVisible(), true);
  await page.keyboard.press("Escape");
  await modal.waitFor({ state: "hidden" });

  await page.getByRole("button", { name: "Pembayaran", exact: true }).click();
  await modal.getByRole("heading", { name: "Pembayaran", exact: true }).waitFor();
  await modal.getByText("Tunai", { exact: true }).click();
  await modal.locator('[name="amount"]').focus();
  await hid(ean);
  assert.equal(await paymentRequests, 0);
  assert.equal(await lookups.length, lookupCount);
  await modal.locator(".detail-close").click();
  await modal.waitFor({ state: "hidden" });

  await nav("master");
  await page.locator('[data-master-tab="pos-settings"]').click();
  await page.locator(".barcode-setting .switch").click();
  await toast.getByText("Barcode Scanner POS nonaktif").waitFor();
  await nav("pos");
  await search.waitFor();
  assert.equal(await indicator.count(), 0);
  await hid(ean);
  assert.equal(await lookups.length, lookupCount);
  assert.deepEqual(errors, []);
});
