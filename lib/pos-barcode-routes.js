import { randomInt } from "node:crypto";
import { hasPermission } from "./access.js";
import { categoryKey } from "./catalog-settings.js";
import { discountedPrice, selectedVariantPrice } from "./domain.js";
import { syncRetailProductStock } from "./physical-stock.js";
import { barcodeMutations, lookupBarcode, readBarcodeCatalog } from "./pos-barcode-store.js";
import { barcodeTargetKey, barcodeText, barcodeVariantTargets, internalBarcodePrefix, inventoryBarcode, retailBarcodeFormat, upcEanEquivalent } from "../public/pos-barcode-rules.js";
import { STAFF_SCAN_CODE } from "../public/stock-scan-rules.js";
import { isMerchandise, PRODUCT_KIND, supportsProductKind } from "../public/product-kind.js";

const ROOT = "/api/pos-barcodes";
const MAX_ALIASES = 20;
const error = (status, code, message) => Object.assign(new Error(message), { status, code });

const canRegister = user => hasPermission(user, "master.products");
export const canScanPosBarcode = user => hasPermission(user, "pos.view") && hasPermission(user, "pos.create");
const canConfigure = user => ["OWNER", "ADMIN"].includes(user?.role) && hasPermission(user, "master.view");
const matchesTarget = (row, productId, targetKey) => row?.productId === productId && row.targetKey === targetKey;

function canPrepareMerchandise(product, options) {
  if (product.productKind || product.priceBasis !== "unit" ||
      !supportsProductKind(categoryKey(options, product.category), product.category)) return false;
  if (product.machineIds?.length || product.finishingIds?.length || product.finishing?.length ||
      product.templateProduct || product.dtfShirt || product.choiceGroups?.some(group => group.options?.length)) return false;
  const variants = product.materialVariants || [];
  const configurations = [product, ...variants, ...(product.fixedSizeVariants || []),
    ...variants.flatMap(variant => variant.combinations || [])];
  return !configurations.some(item => item.materialSources?.length);
}

function activeTarget(product, key) {
  if (!product || product.deletedAt) throw error(404, "BARCODE_PRODUCT", "Produk barcode tidak ditemukan.");
  if (!isMerchandise(product)) throw error(422, "BARCODE_TYPE", "Barcode POS hanya untuk Barang Dagangan.");
  const target = barcodeVariantTargets(product).find(row => row.key === key);
  if (!target) throw error(409, "BARCODE_VARIANT", "Kombinasi varian sudah berubah atau nonaktif.");
  return target;
}

function targetPrice(product, selection) {
  const material = product.materialVariants?.find(row => row.id === selection.materialVariantId);
  const combination = material?.combinations?.find(row => row.subVariantId === selection.subVariantId);
  const size = product.fixedSizeVariants?.find(row => row.id === selection.sizeVariantId);
  return discountedPrice(product, selectedVariantPrice(product, 1, size, material, combination));
}

function catalogRows(products, mappings, catalogOptions) {
  const byProduct = new Map();
  for (const row of mappings) {
    if (!byProduct.has(row.productId)) byProduct.set(row.productId, new Map());
    const variants = byProduct.get(row.productId);
    if (!variants.has(row.targetKey)) variants.set(row.targetKey, []);
    variants.get(row.targetKey).push({ code: row.code, kind: row.kind, format: retailBarcodeFormat(row.code) });
  }
  return products.flatMap(product => {
    if (product.deletedAt) return [];
    const needsMerchandise = !isMerchandise(product) && canPrepareMerchandise(product, catalogOptions);
    if (!isMerchandise(product) && !needsMerchandise) return [];
    return barcodeVariantTargets(product).map(target => ({
      productId: product.id, targetKey: target.key, name: product.name, variant: target.label,
      sku: product.sku, category: product.category, active: product.active !== false, needsMerchandise,
      price: targetPrice(product, target.selection),
      legacyCode: target.key === barcodeTargetKey({}) && barcodeText(product.barcode) || "",
      barcodes: (byProduct.get(product.id)?.get(target.key) || []).sort((a, b) => a.code.localeCompare(b.code, "id")),
    }));
  }).sort((a, b) => a.name.localeCompare(b.name, "id", { numeric: true }) || a.variant.localeCompare(b.variant, "id", { numeric: true }));
}

function factoryCode(value) {
  const code = barcodeText(value);
  if (!code) throw error(422, "BARCODE_INVALID", "Masukkan barcode yang valid, maksimal 128 karakter.");
  if (inventoryBarcode.test(code) || STAFF_SCAN_CODE.test(code) || internalBarcodePrefix.test(code)) {
    throw error(422, "BARCODE_RESERVED", "Kode ini digunakan untuk Stock Scan atau barcode internal.");
  }
  return code;
}

export function registerPosBarcodeRoutes(app, { store, audit }) {
  function route(method, path, allowed, handler) {
    app[method](ROOT + path, async (req, res, next) => {
      try {
        if (!allowed(req.user)) throw error(403, "BARCODE_PERMISSION", "Akun ini tidak memiliki akses barcode tersebut.");
        res.json(await handler(req));
      } catch (cause) { next(cause); }
    });
  }

  function mutate(req, allowed, handler) {
    return store.mutate(async (state, client) => {
      const actor = state.users.find(row => row.id === req.user.id);
      if (!allowed(actor)) throw error(403, "BARCODE_PERMISSION", "Akses barcode akun berubah.");
      return handler(state, client, actor);
    });
  }

  route("get", "/catalog", canRegister, async req => {
    const productId = req.query.productId;
    if (productId !== undefined && (typeof productId !== "string" || productId.length > 150)) {
      throw error(422, "BARCODE_PRODUCT", "ID produk tidak valid.");
    }
    const { products, mappings, catalogOptions } = await readBarcodeCatalog(store, productId);
    return { rows: catalogRows(products, mappings, catalogOptions) };
  });

  route("post", "/prepare-product", canRegister, req => mutate(req, canRegister, (state, _client, actor) => {
    const product = state.products.find(row => row.id === req.body?.productId && !row.deletedAt);
    if (!product) throw error(404, "BARCODE_PRODUCT", "Produk barcode tidak ditemukan.");
    if (product.productKind !== PRODUCT_KIND.MERCHANDISE) {
      if (!canPrepareMerchandise(product, state.catalogOptions)) {
        throw error(422, "BARCODE_TYPE", "Produk ini memerlukan pengaturan jenis produk lewat Daftar Produk.");
      }
      product.productKind = PRODUCT_KIND.MERCHANDISE;
      product.quickSale = false;
      syncRetailProductStock(state, product);
      if (!product.retailStockSku) throw error(409, "BARCODE_STOCK", "SKU produk belum dapat dihubungkan ke Stok Bahan.");
      audit(state, actor, "PRODUCT_KIND_CHANGE", `${product.name} dijadikan Barang Dagangan untuk Barcode POS`, { productId: product.id });
    }
    return { id: product.id, productKind: product.productKind, quickSale: product.quickSale, retailStockSku: product.retailStockSku };
  }));

  route("put", "/settings", canConfigure, req => mutate(req, canConfigure, (state, _client, actor) => {
    if (typeof req.body?.enabled !== "boolean") throw error(422, "BARCODE_SETTING", "Pilih status Barcode Scanner.");
    state.posBarcodeEnabled = req.body.enabled;
    audit(state, actor, "POS_BARCODE_SETTINGS", `Barcode Scanner POS ${state.posBarcodeEnabled ? "diaktifkan" : "dinonaktifkan"}`);
    return { enabled: state.posBarcodeEnabled };
  }));

  for (const [method, path] of [["post", "/register"], ["post", "/generate"], ["delete", "/register"]]) {
    route(method, path, canRegister, req => mutate(req, canRegister, async (state, client, actor) => {
      const { productId, targetKey } = req.body || {};
      const product = state.products.find(row => row.id === productId);
      activeTarget(product, targetKey);
      const registry = barcodeMutations(state, client);
      const existing = await registry.forTarget(product.id, targetKey);
      const fields = { productId: product.id, targetKey };
      if (method === "delete") {
        const code = factoryCode(req.body.code);
        if (!existing.some(row => row.code === code && row.kind === "FACTORY")) throw error(404, "BARCODE_MISSING", "Barcode alternatif tidak ditemukan.");
        await registry.remove(code);
        audit(state, actor, "POS_BARCODE_DELETE", `Menghapus barcode ${product.name}`, { ...fields, code });
      } else if (path === "/generate") {
        const current = existing.find(row => row.kind === "INTERNAL");
        if (current) return { barcode: current };
        const skus = new Set([...state.products, ...state.materials, ...state.inventory].map(row => String(row.sku || "").toUpperCase()));
        for (let attempt = 0; attempt < 20; attempt++) {
          const code = "MPP" + String(randomInt(100_000_000)).padStart(8, "0");
          const barcode = { ...fields, code, kind: "INTERNAL" };
          if (skus.has(code) || !await registry.insert(barcode)) continue;
          audit(state, actor, "POS_BARCODE_GENERATE", `Membuat barcode ${product.name}`, barcode);
          return { barcode };
        }
        throw error(409, "BARCODE_GENERATE", "Barcode belum dapat dibuat. Coba kembali.");
      } else {
        const code = factoryCode(req.body.code);
        const previousCode = req.body.previousCode === undefined ? null : factoryCode(req.body.previousCode);
        if (previousCode && !existing.some(row => row.code === previousCode && row.kind === "FACTORY")) {
          throw error(409, "BARCODE_CHANGED", "Barcode asal sudah berubah. Muat ulang daftar barcode.");
        }
        const current = await registry.find(code);
        if (current && !matchesTarget(current, product.id, targetKey)) throw error(409, "BARCODE_DUPLICATE", "Barcode sudah dipakai produk atau varian lain.");
        const equivalent = upcEanEquivalent(code);
        const sharedSymbol = equivalent && await registry.find(equivalent);
        if (sharedSymbol && !matchesTarget(sharedSymbol, product.id, targetKey)) {
          throw error(409, "BARCODE_DUPLICATE", "Barcode UPC/EAN ini sudah dipakai produk atau varian lain.");
        }
        if (!current && existing.filter(row => row.kind === "FACTORY").length >= MAX_ALIASES && !previousCode) throw error(422, "BARCODE_LIMIT", "Maksimal 20 barcode alternatif per varian.");
        if (state.products.some(row => row.id !== product.id && !row.deletedAt && (row.barcode === code || equivalent && row.barcode === equivalent))) {
          throw error(409, "BARCODE_DUPLICATE", "Barcode ini tercatat sebagai barcode lama produk lain.");
        }
        const barcode = current || { ...fields, code, kind: "FACTORY" };
        if (!current && !await registry.insert(barcode)) throw error(409, "BARCODE_DUPLICATE", "Barcode sudah dipakai produk atau varian lain.");
        if (previousCode && previousCode !== code) await registry.remove(previousCode);
        if (!current || previousCode && previousCode !== code) {
          audit(state, actor, "POS_BARCODE_REGISTER", `Mendaftarkan barcode ${product.name}`, { ...barcode, previousCode });
        }
        return { barcode };
      }
      return { ok: true };
    }));
  }

  route("get", "/lookup", canScanPosBarcode, async req => {
    const code = barcodeText(req.query.code);
    if (!code) throw error(422, "BARCODE_INVALID", "Format barcode tidak valid.");
    const { enabled, mapping, product } = await lookupBarcode(store, code, upcEanEquivalent(code));
    if (enabled !== true) throw error(409, "BARCODE_DISABLED", "Barcode Scanner POS sedang nonaktif.");
    if (inventoryBarcode.test(code) || !mapping && STAFF_SCAN_CODE.test(code)) {
      throw error(422, "BARCODE_INVENTORY", "Barcode ini digunakan di halaman Stock Scan.");
    }
    if (!mapping) throw error(404, "BARCODE_UNKNOWN", "Barcode tidak ditemukan.");
    if (!product || product.deletedAt || product.active === false) throw error(409, "BARCODE_INACTIVE", "Produk barcode sudah nonaktif.");
    const { selection } = activeTarget(product, mapping.targetKey);
    if (product.dtfShirt || product.templateProduct || product.choiceGroups?.some(row => row.options?.length) ||
        product.priceBasis !== "unit" && !selection.sizeVariantId) {
      throw error(422, "BARCODE_CONFIGURE", `Pilih konfigurasi ${product.name} melalui katalog.`);
    }
    return { productId: product.id, selection };
  });
}
