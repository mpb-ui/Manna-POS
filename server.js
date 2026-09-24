import crypto from "node:crypto";
import express from "express";
import { calculateOrder, allowedNextStatus, STATUS, STATUS_LABEL } from "./lib/domain.js";
import { Store } from "./lib/store.js";
import { PERMISSIONS, ROLE_PRESETS, allowedStatusForRole, effectivePermissions, hasPermission, orderVisibleToUser, publicUser } from "./lib/access.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const appPin = process.env.APP_PIN || "";
const sessionSecret = process.env.SESSION_SECRET || "manna-pos-local-development";
const store = new Store(process.env.DATABASE_URL);

app.use(express.json({ limit: "5mb" }));

function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 32).toString("hex");
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left)); const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sessionToken(user) {
  const expires = Date.now() + 12 * 60 * 60 * 1000;
  const body = `${user.id}.${Number(user.sessionVersion || 1)}.${expires}`;
  const signature = crypto.createHmac("sha256", sessionSecret).update(body).digest("hex");
  return `${body}.${signature}`;
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }));
}

function readToken(req) {
  const token = parseCookies(req.headers.cookie).manna_session || "";
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [userId, version, expires, supplied] = parts;
  const body = `${userId}.${version}.${expires}`;
  const expected = crypto.createHmac("sha256", sessionSecret).update(body).digest("hex");
  if (!secureEqual(supplied, expected) || Number(expires) < Date.now()) return null;
  return { userId, version: Number(version) };
}

app.get("/api/health", (_req, res) => res.json({ ok: true, database: process.env.DATABASE_URL ? "postgres" : "memory" }));
app.get("/api/session", async (req, res, next) => {
  try {
    const token = readToken(req); const state = await store.read();
    const user = token ? state.users.find((item) => item.id === token.userId && item.active !== false && Number(item.sessionVersion || 1) === token.version) : null;
    res.json({ authenticated: Boolean(user), user: publicUser(user), pinRequired: true });
  } catch (error) { next(error); }
});
app.post("/api/login", async (req, res, next) => {
  try {
    const username = text(req.body.username).toLowerCase(); const pin = String(req.body.pin || "");
    const result = await store.mutate((state) => {
      const user = state.users.find((item) => item.username.toLowerCase() === username && item.active !== false);
      if (!user || !secureEqual(hashPin(pin, user.pinSalt), user.pinHash)) throw new Error("Username atau PIN tidak sesuai");
      user.lastLoginAt = now();
      audit(state, user, "LOGIN", "User masuk ke sistem");
      return publicUser(user);
    });
    const state = await store.read(); const user = state.users.find((item) => item.id === result.id);
    res.setHeader("Set-Cookie", `manna_session=${sessionToken(user)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    res.json({ ok: true, user: result });
  } catch (error) { res.status(401).json({ error: error.message || "Login gagal" }); }
});
app.post("/api/logout", (_req, res) => {
  res.setHeader("Set-Cookie", `manna_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  res.json({ ok: true });
});

app.use("/api", async (req, res, next) => {
  try {
    const token = readToken(req); if (!token) return res.status(401).json({ error: "Sesi berakhir" });
    const state = await store.read();
    const user = state.users.find((item) => item.id === token.userId && item.active !== false && Number(item.sessionVersion || 1) === token.version);
    if (!user) return res.status(401).json({ error: "Sesi berakhir" });
    req.user = user; next();
  } catch (error) { next(error); }
});

function requirePermission(permission) {
  return (req, res, next) => hasPermission(req.user, permission) ? next() : res.status(403).json({ error: "Anda tidak memiliki akses untuk tindakan ini" });
}

function now() { return new Date().toISOString(); }
function orderCode(number) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).replaceAll("-", "");
  return `MP-${date}-${String(number).padStart(4, "0")}`;
}
function activity(state, order, message, actor = "Kasir") {
  const entry = { id: crypto.randomUUID(), orderId: order.id, orderCode: order.code, message, actor, createdAt: now() };
  order.timeline.unshift(entry);
  state.activities.unshift(entry);
}

function audit(state, user, action, description, metadata = {}) {
  state.auditLogs ||= [];
  state.auditLogs.unshift({ id: crypto.randomUUID(), userId: user?.id || null, userName: user?.name || "Sistem", action, description, metadata, createdAt: now() });
  state.auditLogs = state.auditLogs.slice(0, 2000);
}

function sanitizeProduct(product, user) {
  const copy = structuredClone(product);
  if (!hasPermission(user, "reports.cost") && !hasPermission(user, "master.products")) delete copy.baseCost;
  if (!hasPermission(user, "stock.value") && !hasPermission(user, "master.materials")) {
    (copy.materialSources || []).forEach((item) => delete item.cost);
  }
  return copy;
}

function sanitizeOrder(order, user) {
  const copy = structuredClone(order);
  const canSeeMoney = hasPermission(user, "projects.money");
  if (!canSeeMoney) {
    delete copy.total; delete copy.paidAmount; delete copy.payments; delete copy.paymentStatus; delete copy.paymentConfirmed;
    copy.items.forEach((item) => {
      ["unitPrice", "originalUnitPrice", "baseTotal", "finishingTotal", "fileServiceTotal", "templateDesignTotal", "subtotal"].forEach((key) => delete item[key]);
      (item.finishing || []).forEach((finish) => { delete finish.unitPrice; delete finish.subtotal; });
      if (item.fileService) delete item.fileService.price;
    });
  }
  return copy;
}

function text(value) { return String(value || "").trim(); }
function identifier(prefix, value) {
  const slug = text(value).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${prefix}-${slug || crypto.randomUUID().slice(0, 8)}`;
}
function unique(state, collection, field, value, currentId) {
  if (state[collection].some((item) => item.id !== currentId && text(item[field]).toLowerCase() === text(value).toLowerCase())) {
    throw new Error(`${field === "sku" || field === "code" ? "Kode" : "Nama"} sudah digunakan`);
  }
}
function normalizeTiers(body, retailPrice) {
  if (!body.wholesaleEnabled) return [];
  const tiers = (body.priceTiers || []).slice(0, 10).map((tier) => ({
    min: Math.max(1, Number(tier.min || 1)), max: tier.max === "" || tier.max == null ? null : Number(tier.max),
    price: Math.max(0, Number(tier.price || 0))
  })).sort((a, b) => a.min - b.min);
  if (!tiers.length) throw new Error("Tambahkan minimal satu tingkat harga grosir");
  for (let index = 0; index < tiers.length; index += 1) {
    const tier = tiers[index];
    if (!tier.price) throw new Error("Harga setiap tingkat wajib diisi");
    if (tier.max != null && tier.max < tier.min) throw new Error("Maksimum quantity tidak boleh lebih kecil dari minimum");
    if (index && (tiers[index - 1].max == null || tier.min <= tiers[index - 1].max)) throw new Error("Rentang harga grosir tidak boleh tumpang tindih");
  }
  if (tiers[0].min !== 1) tiers.unshift({ min: 1, max: tiers[0].min - 1, price: retailPrice });
  return tiers.slice(0, 10);
}

function normalizeDiscount(body) {
  const source = body.discount || {};
  const enabled = Boolean(source.enabled);
  const type = source.type === "nominal" ? "nominal" : "percent";
  const value = Math.max(0, Number(source.value || 0));
  const startsAt = text(source.startsAt);
  const endsAt = text(source.endsAt);
  if (enabled && !value) throw new Error("Nilai diskon wajib diisi saat promo diaktifkan");
  if (type === "percent" && value > 100) throw new Error("Diskon persentase maksimal 100%");
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) throw new Error("Waktu selesai promo harus setelah waktu mulai");
  return { enabled, type, value, startsAt, endsAt };
}

function normalizeOrder(order) {
  order.designPic ||= "";
  order.paidAmount = Number(order.paidAmount || 0);
  order.payments ||= [];
  order.paymentConfirmed = Boolean(order.paymentConfirmed);
  order.paymentStatus = order.paidAmount >= Number(order.total || 0) && order.total > 0
    ? "LUNAS"
    : order.paymentConfirmed ? "BELUM_LUNAS" : "BELUM_BAYAR";
  order.items ||= [];
  order.items.forEach((item, index) => {
    if (item.productionNote == null) item.productionNote = index === 0 ? String(order.notes || "") : "";
  });
  order.timeline ||= [];
  return order;
}

app.get("/api/bootstrap", async (req, res, next) => {
  try {
    const state = await store.read();
    state.orders.forEach(normalizeOrder);
    const permissions = effectivePermissions(req.user);
    const canCatalog = permissions.includes("pos.view") || permissions.includes("master.view");
    const canStock = permissions.includes("stock.view") || permissions.includes("master.view");
    const canMaster = permissions.includes("master.view");
    const materials = canStock ? structuredClone(state.materials) : [];
    if (!permissions.includes("stock.value") && !permissions.includes("master.materials")) materials.forEach((item) => { delete item.cost; delete item.supplier; });
    res.json({
      currentUser: publicUser(req.user), permissions,
      permissionCatalog: permissions.includes("users.manage") ? PERMISSIONS : [], rolePresets: permissions.includes("users.manage") ? ROLE_PRESETS : {},
      products: canCatalog ? state.products.filter((item) => item.active !== false).map((item) => sanitizeProduct(item, req.user)) : [],
      allProducts: canMaster ? state.products.map((item) => sanitizeProduct(item, req.user)) : [],
      catalogOptions: canCatalog || canMaster ? state.catalogOptions : { categories: [], saleUnits: [], priceBases: [] },
      materials, finishings: canCatalog || canMaster ? state.finishings : [], machines: canCatalog || canMaster || permissions.includes("reports.view") ? state.machines : [],
      orders: state.orders.filter((order) => orderVisibleToUser(order, req.user)).map((order) => sanitizeOrder(order, req.user)),
      inventory: canStock ? state.inventory : [], stockMovements: canStock ? state.stockMovements.slice(0, 50) : [], statusLabels: STATUS_LABEL,
      users: permissions.includes("users.manage") ? state.users.map(publicUser) : [],
      auditLogs: permissions.includes("audit.view") ? state.auditLogs.slice(0, 100) : []
    });
  } catch (error) { next(error); }
});

app.post("/api/catalog-options/:kind", requirePermission("master.products"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const kind = req.params.kind;
      const label = text(req.body.label);
      if (!label) throw new Error("Nama pilihan wajib diisi");
      if (kind === "categories" || kind === "saleUnits") {
        const items = state.catalogOptions[kind];
        if (items.some((item) => item.toLowerCase() === label.toLowerCase())) throw new Error("Pilihan sudah tersedia");
        items.push(label);
        audit(state, req.user, "CATALOG_OPTION_CREATE", `Menambahkan ${kind === "categories" ? "kategori" : "satuan jual"} ${label}`);
        return { kind, option: label, options: state.catalogOptions };
      }
      if (kind === "priceBases") {
        const mode = ["unit", "sqm", "linear_m"].includes(req.body.mode) ? req.body.mode : "unit";
        const id = identifier("basis", label);
        if (state.catalogOptions.priceBases.some((item) => item.label.toLowerCase() === label.toLowerCase())) throw new Error("Dasar perhitungan sudah tersedia");
        const option = { id, label, mode };
        state.catalogOptions.priceBases.push(option);
        audit(state, req.user, "CATALOG_OPTION_CREATE", `Menambahkan dasar perhitungan ${label}`, { mode });
        return { kind, option, options: state.catalogOptions };
      }
      throw new Error("Jenis pilihan tidak valid");
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.post("/api/materials", requirePermission("master.materials"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const name = text(req.body.name); const sku = text(req.body.sku).toUpperCase();
      if (!name || !sku || !text(req.body.unit)) throw new Error("Nama, SKU, dan satuan bahan wajib diisi");
      unique(state, "materials", "sku", sku); unique(state, "materials", "name", name);
      const material = { id: identifier("mat", sku), sku, name, category: text(req.body.category) || "Lainnya", unit: text(req.body.unit), stock: Math.max(0, Number(req.body.stock || 0)), minStock: Math.max(0, Number(req.body.minStock || 0)), cost: Math.max(0, Number(req.body.cost || 0)), supplier: text(req.body.supplier), active: req.body.active !== false };
      state.materials.push(material);
      state.inventory.push({ sku, materialId: material.id, productName: name, category: material.category, width: null, quantity: material.stock, minStock: material.minStock, unit: material.unit, updatedAt: now() });
      audit(state, req.user, "MATERIAL_CREATE", `Menambahkan bahan ${name}`, { materialId: material.id, sku });
      return material;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.put("/api/materials/:id", requirePermission("master.materials"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const material = state.materials.find((item) => item.id === req.params.id);
      if (!material) throw new Error("Bahan tidak ditemukan");
      const name = text(req.body.name); const sku = text(req.body.sku).toUpperCase(); const unit = text(req.body.unit);
      if (!name || !sku || !unit) throw new Error("Nama, SKU, dan satuan bahan wajib diisi");
      unique(state, "materials", "sku", sku, material.id); unique(state, "materials", "name", name, material.id);
      const oldSku = material.sku;
      Object.assign(material, { sku, name, category: text(req.body.category) || "Lainnya", unit, minStock: Math.max(0, Number(req.body.minStock || 0)), cost: Math.max(0, Number(req.body.cost || 0)), supplier: text(req.body.supplier), active: req.body.active !== false });
      const stock = state.inventory.find((item) => item.sku === oldSku || item.materialId === material.id);
      if (stock) Object.assign(stock, { sku, materialId: material.id, productName: name, category: material.category, minStock: material.minStock, unit, updatedAt: now() });
      audit(state, req.user, "MATERIAL_UPDATE", `Memperbarui bahan ${name}`, { materialId: material.id, sku });
      return material;
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.post("/api/finishings", requirePermission("master.finishings"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const name = text(req.body.name); const code = text(req.body.code).toUpperCase();
      const categories = [...new Set(req.body.categories || [])].map(text).filter(Boolean);
      if (!name || !code || !categories.length) throw new Error("Nama, kode, dan minimal satu kategori finishing wajib diisi");
      unique(state, "finishings", "code", code); unique(state, "finishings", "name", name);
      const finishing = { id: identifier("fin", code), code, name, categories, price: Math.max(0, Number(req.body.price || 0)), rule: text(req.body.rule) || "free", active: req.body.active !== false };
      state.finishings.push(finishing); audit(state, req.user, "FINISHING_CREATE", `Menambahkan finishing ${name}`, { finishingId: finishing.id }); return finishing;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.put("/api/finishings/:id", requirePermission("master.finishings"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const finishing = state.finishings.find((item) => item.id === req.params.id);
      if (!finishing) throw new Error("Finishing tidak ditemukan");
      const name = text(req.body.name); const code = text(req.body.code).toUpperCase();
      const categories = [...new Set(req.body.categories || [])].map(text).filter(Boolean);
      if (!name || !code || !categories.length) throw new Error("Nama, kode, dan minimal satu kategori finishing wajib diisi");
      unique(state, "finishings", "code", code, finishing.id); unique(state, "finishings", "name", name, finishing.id);
      Object.assign(finishing, { code, name, categories, price: Math.max(0, Number(req.body.price || 0)), rule: text(req.body.rule) || "free", active: req.body.active !== false });
      audit(state, req.user, "FINISHING_UPDATE", `Memperbarui finishing ${name}`, { finishingId: finishing.id });
      return finishing;
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.post("/api/machines", requirePermission("master.machines"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const name = text(req.body.name); const code = text(req.body.code).toUpperCase();
      if (!name || !code) throw new Error("Nama dan kode mesin wajib diisi");
      unique(state, "machines", "name", name);
      const machine = { id: identifier("mach", code), code, name, type: text(req.body.type) || "Produksi", status: text(req.body.status) || "AKTIF", costPerHour: Math.max(0, Number(req.body.costPerHour || 0)), capacity: text(req.body.capacity), active: req.body.active !== false };
      state.machines.push(machine); audit(state, req.user, "MACHINE_CREATE", `Menambahkan mesin ${name}`, { machineId: machine.id }); return machine;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.put("/api/machines/:id", requirePermission("master.machines"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const machine = state.machines.find((item) => item.id === req.params.id);
      if (!machine) throw new Error("Mesin tidak ditemukan");
      const name = text(req.body.name); const code = text(req.body.code).toUpperCase();
      if (!name || !code) throw new Error("Nama dan kode mesin wajib diisi");
      unique(state, "machines", "name", name, machine.id);
      Object.assign(machine, { code, name, type: text(req.body.type) || "Produksi", status: text(req.body.status) || "AKTIF", costPerHour: Math.max(0, Number(req.body.costPerHour || 0)), capacity: text(req.body.capacity), active: req.body.active !== false });
      audit(state, req.user, "MACHINE_UPDATE", `Memperbarui mesin ${name}`, { machineId: machine.id });
      return machine;
    });
    res.json(result);
  } catch (error) { next(error); }
});

function saveProduct(state, body, current = null) {
  const name = text(body.name); const sku = text(body.sku).toUpperCase();
  const price = Math.max(0, Number(body.price || 0)); const baseCost = Math.max(0, Number(body.baseCost || 0));
  if (!name || !sku || !text(body.category) || !price) throw new Error("Nama, SKU, kategori, dan harga jual wajib diisi");
  unique(state, "products", "sku", sku, current?.id); unique(state, "products", "name", name, current?.id);
  const basisOption = state.catalogOptions.priceBases.find((item) => item.id === body.priceBasisId || item.label === body.priceBasisLabel);
  const priceBasis = ["unit", "sqm", "linear_m"].includes(body.priceBasis) ? body.priceBasis : basisOption?.mode || "unit";
  const priceBasisLabel = basisOption?.label || text(body.priceBasisLabel) || ({ unit: "Per unit", sqm: "Luas m²", linear_m: "Meter lari" }[priceBasis]);
  const saleUnit = text(body.saleUnit) || "pcs";
  const sourceIds = new Set();
  const materialSources = (body.materialSources || []).filter((source) => Number(source.quantity) > 0).map((source) => {
    const material = state.materials.find((item) => item.id === source.materialId);
    if (!material || material.active === false) throw new Error("Pilih bahan aktif yang valid");
    if (sourceIds.has(material.id)) throw new Error("Bahan yang sama tidak boleh ditambahkan dua kali");
    sourceIds.add(material.id);
    return { materialId: material.id, sku: material.sku, name: material.name, unit: material.unit, quantity: Number(source.quantity), wastePercent: Math.max(0, Number(source.wastePercent || 0)) };
  });
  if (!materialSources.length && !current?.groupedProduct) throw new Error("Produk wajib memiliki minimal satu sumber bahan");
  const machineIds = [...new Set(body.machineIds || [])].filter((id) => state.machines.some((machine) => machine.id === id && machine.active !== false));
  if (!machineIds.length && !current) throw new Error("Pilih minimal satu mesin");
  const unitLabels = { pcs: "/pcs", lbr: "/lembar", "m²": "/m²", pack: "/pack", rim: "/rim", set: "/set", "m lari": "/m lari" };
  const finishingIds = [...new Set(body.finishingIds || [])].filter((id) => state.finishings.some((item) => item.id === id && item.active !== false && item.categories.includes(text(body.category))));
  const finishing = finishingIds.map((id) => structuredClone(state.finishings.find((item) => item.id === id)));
  const category = text(body.category);
  const product = { id: current?.id || identifier("prd", sku), sku, name, category, baseCost, price, priceBasis, priceBasisLabel, saleUnit, unitName: saleUnit, unitLabel: unitLabels[saleUnit] || `/${saleUnit}`, widths: priceBasis === "unit" ? [] : (body.widths || []).map(Number).filter((value) => value > 0), billingIncrement: ["LF Poster", "LF Sticker"].includes(category) ? 0.1 : Number(current?.billingIncrement || 0.5), areaPerUnit: Number(current?.areaPerUnit || 0), note: text(body.note), featured: Boolean(body.featured), recommendation: text(body.recommendation) || "Produk pilihan", active: body.active !== false, wholesaleEnabled: Boolean(body.wholesaleEnabled), priceTiers: normalizeTiers(body, price), discount: normalizeDiscount(body), materialSources, machineIds, finishingIds, finishing, templateProduct: Boolean(current?.templateProduct), sizeVariants: current?.sizeVariants || [], designTemplates: current?.designTemplates || [], fixedSizeVariants: current?.fixedSizeVariants || [], groupedProduct: Boolean(current?.groupedProduct), choiceGroups: current?.choiceGroups || [], cardPrice: Number(current?.cardPrice || 0) };
  if (priceBasis !== "unit" && !product.widths.length) throw new Error("Tambahkan minimal satu pilihan lebar bahan");
  if (current) Object.assign(current, product); else state.products.push(product);
  return product;
}

app.post("/api/products", requirePermission("master.products"), async (req, res, next) => {
  try { const result = await store.mutate((state) => { const product = saveProduct(state, req.body); audit(state, req.user, "PRODUCT_CREATE", `Menambahkan produk ${product.name}`, { productId: product.id, price: product.price }); return product; }); res.status(201).json(result); } catch (error) { next(error); }
});
app.put("/api/products/:id", requirePermission("master.products"), async (req, res, next) => {
  try { const result = await store.mutate((state) => { const product = state.products.find((item) => item.id === req.params.id); if (!product) throw new Error("Produk tidak ditemukan"); const beforePrice = product.price; const saved = saveProduct(state, req.body, product); audit(state, req.user, "PRODUCT_UPDATE", `Memperbarui produk ${saved.name}`, { productId: saved.id, beforePrice, price: saved.price }); return saved; }); res.json(result); } catch (error) { next(error); }
});

app.post("/api/orders", requirePermission("pos.create"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const priced = calculateOrder(state.products, req.body.items || []);
      if (!priced.items.length) throw new Error("Pesanan belum memiliki produk");
      if (!String(req.body.customerName || "").trim()) throw new Error("Nama pelanggan wajib diisi");
      const order = {
        id: crypto.randomUUID(),
        code: orderCode(state.nextOrderNumber++),
        customerName: String(req.body.customerName).trim(),
        phone: String(req.body.phone || "").trim(),
        deadline: req.body.deadline || null,
        fileStatus: req.body.fileStatus || "SIAP_CETAK",
        designPic: "",
        paidAmount: 0,
        payments: [],
        paymentConfirmed: false,
        paymentStatus: "BELUM_BAYAR",
        status: STATUS.WAITING_PAYMENT,
        createdById: req.user.id,
        createdByName: req.user.name,
        stockCommitted: false,
        items: priced.items,
        total: priced.total,
        createdAt: now(),
        updatedAt: now(),
        timeline: []
      };
      activity(state, order, "Pesanan dibuat di POS", req.user.name);
      audit(state, req.user, "ORDER_CREATE", `Membuat pesanan ${order.code}`, { orderId: order.id, total: order.total });
      state.orders.unshift(order);
      return order;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.put("/api/orders/:id", requirePermission("pos.edit"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const order = state.orders.find((item) => item.id === req.params.id);
      if (!order) throw new Error("Pesanan tidak ditemukan");
      normalizeOrder(order);
      if (order.status !== STATUS.WAITING_PAYMENT || order.paymentConfirmed) throw new Error("Hanya draft yang belum dibayar yang dapat diedit");
      const priced = calculateOrder(state.products, req.body.items || []);
      if (!priced.items.length) throw new Error("Pesanan belum memiliki produk");
      if (!String(req.body.customerName || "").trim()) throw new Error("Nama pelanggan wajib diisi");
      order.customerName = String(req.body.customerName).trim();
      order.phone = String(req.body.phone || "").trim();
      order.deadline = req.body.deadline || null;
      order.fileStatus = req.body.fileStatus || "SIAP_CETAK";
      order.items = priced.items;
      order.total = priced.total;
      order.updatedAt = now();
      activity(state, order, "Draft pesanan diperbarui", req.user.name);
      audit(state, req.user, "ORDER_UPDATE", `Memperbarui draft ${order.code}`, { orderId: order.id });
      return order;
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.post("/api/orders/:id/payments", requirePermission("pos.payment"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const order = state.orders.find((item) => item.id === req.params.id);
      if (!order) throw new Error("Pesanan tidak ditemukan");
      normalizeOrder(order);
      const type = req.body.type === "PO" ? "PO" : "PAYMENT";
      const method = type === "PO" ? "PO / TEMPO" : String(req.body.method || "").trim();
      const amount = Math.max(0, Number(req.body.amount || 0));
      const outstanding = Math.max(0, order.total - order.paidAmount);
      const poNumber = String(req.body.poNumber || "").trim();
      const poAttachment = req.body.poAttachment || null;
      if (type === "PAYMENT" && !method) throw new Error("Metode pembayaran wajib dipilih");
      if (type === "PAYMENT" && amount <= 0) throw new Error("Nominal pembayaran wajib diisi");
      if (amount > outstanding) throw new Error("Nominal diterima melebihi sisa tagihan");
      if (type === "PO" && !poNumber) throw new Error("Nomor PO wajib diisi");
      if (poAttachment) {
        if (!/^image\/(png|jpe?g|webp)$/i.test(String(poAttachment.type || ""))) throw new Error("File PO harus berupa gambar JPG, PNG, atau WebP");
        if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(String(poAttachment.dataUrl || ""))) throw new Error("Data gambar PO tidak valid");
        if (String(poAttachment.dataUrl).length > 3_500_000) throw new Error("Ukuran gambar PO maksimal 2,5 MB");
      }
      const payment = { id: crypto.randomUUID(), method, type, amount, poNumber, poAttachment: poAttachment ? { name: text(poAttachment.name), type: text(poAttachment.type), dataUrl: poAttachment.dataUrl } : null, createdAt: now() };
      order.payments.push(payment);
      order.paidAmount += amount;
      order.paymentConfirmed = true;
      order.paymentStatus = order.paidAmount >= order.total ? "LUNAS" : "BELUM_LUNAS";
      if (order.status === STATUS.WAITING_PAYMENT) order.status = STATUS.DESIGN;
      order.updatedAt = now();
      activity(state, order, `${type === "PO" ? `Pembayaran PO ${poNumber}` : `Pembayaran ${method}`} dicatat`, req.user.name);
      audit(state, req.user, "PAYMENT_CREATE", `Mencatat pembayaran ${order.code}`, { orderId: order.id, type, method, amount });
      return order;
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.patch("/api/orders/:id/design-pic", requirePermission("projects.assign"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const order = state.orders.find((item) => item.id === req.params.id);
      if (!order) throw new Error("Pesanan tidak ditemukan");
      normalizeOrder(order);
      if (![STATUS.DESIGN, STATUS.PRINT, STATUS.FINISHING, STATUS.DONE].includes(order.status)) throw new Error("PIC hanya dapat ditetapkan pada pesanan aktif");
      const designPic = String(req.body.designPic || "").trim();
      if (!designPic) throw new Error("Nama operator wajib diisi");
      if (!["Gema", "Qori", "Cc/Ko"].includes(designPic)) throw new Error("Nama operator tidak valid");
      order.designPic = designPic;
      order.updatedAt = now();
      activity(state, order, `Pekerjaan diambil oleh ${designPic}`, designPic);
      return order;
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.patch("/api/orders/:id/status", requirePermission("projects.status"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const order = state.orders.find((item) => item.id === req.params.id);
      if (!order) throw new Error("Pesanan tidak ditemukan");
      normalizeOrder(order);
      const target = req.body.status;
      if (target !== allowedNextStatus(order.status)) throw new Error("Perpindahan status tidak valid");
      if (!allowedStatusForRole(req.user.role, order.status, target)) throw new Error("Role Anda tidak dapat memindahkan status ini");
      if (order.status === STATUS.DESIGN && !order.designPic) throw new Error("Nama PIC Operator Design wajib diisi");
      order.status = target;
      order.updatedAt = now();
      if (target === STATUS.DONE && !order.stockCommitted) {
        for (const line of order.items) {
          const consumptions = line.materials?.length ? line.materials : [{ sku: line.stockSku, name: line.productName, units: line.stockConsumption }];
          for (const consumption of consumptions) {
            const stock = state.inventory.find((item) => item.sku === consumption.sku || item.materialId === consumption.materialId);
            if (!stock) continue;
            stock.quantity = Number(stock.quantity) - Number(consumption.units || 0);
            stock.updatedAt = now();
            state.stockMovements.unshift({
              id: crypto.randomUUID(), sku: stock.sku, productName: stock.productName,
              change: -Number(consumption.units || 0), balance: stock.quantity, orderCode: order.code,
              reason: "Pemakaian produksi selesai", createdAt: now()
            });
          }
        }
        order.stockCommitted = true;
      }
      activity(state, order, `Status berubah menjadi ${STATUS_LABEL[target]}`, req.user.name);
      audit(state, req.user, "ORDER_STATUS", `Mengubah ${order.code} menjadi ${STATUS_LABEL[target]}`, { orderId: order.id, status: target });
      return order;
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.patch("/api/inventory/:sku", requirePermission("stock.adjust"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const stock = state.inventory.find((item) => item.sku === req.params.sku);
      if (!stock) throw new Error("Item stok tidak ditemukan");
      const change = Number(req.body.change);
      if (!Number.isFinite(change) || change === 0) throw new Error("Jumlah penyesuaian tidak valid");
      stock.quantity = Number(stock.quantity) + change;
      const movementDate = text(req.body.movementDate);
      const createdAt = movementDate ? new Date(`${movementDate}T12:00:00+08:00`).toISOString() : now();
      if (Number.isNaN(new Date(createdAt).getTime())) throw new Error("Tanggal stok tidak valid");
      stock.updatedAt = now();
      const movement = { id: crypto.randomUUID(), sku: stock.sku, productName: stock.productName, category: stock.category || "", change, balance: stock.quantity, orderCode: null, reason: String(req.body.reason || "Penyesuaian stok"), movementDate: movementDate || null, createdAt, recordedAt: now() };
      state.stockMovements.unshift(movement);
      audit(state, req.user, "STOCK_ADJUST", `Menyesuaikan stok ${stock.productName}`, { sku: stock.sku, change, balance: stock.quantity, reason: movement.reason });
      return { stock, movement };
    });
    res.json(result);
  } catch (error) { next(error); }
});

function normalizePermissions(values) {
  const valid = new Set(PERMISSIONS.map((item) => item.id));
  return [...new Set(Array.isArray(values) ? values : [])].filter((item) => valid.has(item));
}

app.post("/api/users", requirePermission("users.manage"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const name = text(req.body.name); const username = text(req.body.username).toLowerCase(); const pin = String(req.body.pin || "");
      const role = ROLE_PRESETS[req.body.role] ? req.body.role : "CASHIER";
      if (!name || !username || pin.length < 4) throw new Error("Nama, username, dan PIN minimal 4 digit wajib diisi");
      if (state.users.some((item) => item.username.toLowerCase() === username)) throw new Error("Username sudah digunakan");
      const pinSalt = crypto.randomBytes(16).toString("hex");
      const user = { id: crypto.randomUUID(), name, username, role, permissions: normalizePermissions(Array.isArray(req.body.permissions) ? req.body.permissions : ROLE_PRESETS[role].permissions), reportScope: req.body.reportScope || ROLE_PRESETS[role].reportScope, pinSalt, pinHash: hashPin(pin, pinSalt), active: req.body.active !== false, sessionVersion: 1, createdAt: now(), lastLoginAt: null };
      state.users.push(user); audit(state, req.user, "USER_CREATE", `Membuat user ${name}`, { targetUserId: user.id, role });
      return publicUser(user);
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.put("/api/users/:id", requirePermission("users.manage"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const user = state.users.find((item) => item.id === req.params.id); if (!user) throw new Error("User tidak ditemukan");
      const name = text(req.body.name); const username = text(req.body.username).toLowerCase();
      const role = ROLE_PRESETS[req.body.role] ? req.body.role : user.role;
      if (!name || !username) throw new Error("Nama dan username wajib diisi");
      if (state.users.some((item) => item.id !== user.id && item.username.toLowerCase() === username)) throw new Error("Username sudah digunakan");
      if (user.id === req.user.id && req.body.active === false) throw new Error("Anda tidak dapat menonaktifkan akun sendiri");
      if (user.role === "OWNER" && role !== "OWNER" && state.users.filter((item) => item.role === "OWNER" && item.active !== false).length <= 1) throw new Error("Minimal satu Owner aktif harus tersedia");
      const permissions = normalizePermissions(Array.isArray(req.body.permissions) ? req.body.permissions : ROLE_PRESETS[role].permissions);
      if (user.id === req.user.id && !permissions.includes("users.manage")) throw new Error("Akses kelola user tidak dapat dicabut dari akun yang sedang digunakan");
      Object.assign(user, { name, username, role, permissions, reportScope: req.body.reportScope || ROLE_PRESETS[role].reportScope, active: req.body.active !== false });
      const pin = String(req.body.pin || "");
      if (pin) { if (pin.length < 4) throw new Error("PIN minimal 4 digit"); user.pinSalt = crypto.randomBytes(16).toString("hex"); user.pinHash = hashPin(pin, user.pinSalt); user.sessionVersion = Number(user.sessionVersion || 1) + 1; }
      audit(state, req.user, "USER_UPDATE", `Memperbarui user ${name}`, { targetUserId: user.id, role, pinChanged: Boolean(pin) });
      return publicUser(user);
    });
    res.json(result);
  } catch (error) { next(error); }
});

function reportRange(query, user) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
  const scope = user.reportScope || ROLE_PRESETS[user.role]?.reportScope || "all";
  const fromText = scope === "today" ? today : String(query.from || "");
  const toText = scope === "today" ? today : String(query.to || "");
  const defaultFrom = new Date(); defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
  const fallbackFrom = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(defaultFrom);
  const from = new Date(`${fromText || fallbackFrom}T00:00:00+08:00`);
  const to = new Date(`${toText || today}T23:59:59.999+08:00`);
  return { from, to, fromText: fromText || fallbackFrom, toText: toText || today, locked: scope === "today", scope };
}

function estimateItemCost(item, state) {
  const materialCost = (item.materials || []).reduce((sum, usage) => {
    const material = state.materials.find((row) => row.id === usage.materialId || row.sku === usage.sku);
    return sum + Number(usage.units || 0) * Number(usage.unitCost ?? material?.cost ?? 0);
  }, 0);
  if (materialCost > 0) return materialCost;
  const product = state.products.find((row) => row.id === item.productId);
  if (!product?.baseCost) return 0;
  const units = item.priceBasis === "sqm" ? Number(item.width || 0) * Number(item.billedLength || 0) * Number(item.quantity || 1) : item.priceBasis === "linear_m" ? Number(item.billedLength || 0) * Number(item.quantity || 1) : Number(item.quantity || 1);
  return Number(product.baseCost) * units;
}

function aggregateReport(state, user, query) {
  const range = reportRange(query, user); const money = hasPermission(user, "reports.money"); const cost = hasPermission(user, "reports.cost");
  const category = text(query.category); const machineId = text(query.machineId); const paymentStatus = text(query.paymentStatus);
  const selectedItems = (order) => order.items.filter((item) => { const product = state.products.find((row) => row.id === item.productId); return (!category || product?.category === category) && (!machineId || (product?.machineIds || []).includes(machineId)); });
  const inUserScope = (order) => range.scope !== "own" || order.createdById === user.id || order.designPic === user.name;
  const orders = state.orders.map(normalizeOrder).filter((order) => {
    const date = new Date(order.createdAt); if (date < range.from || date > range.to) return false;
    if (!inUserScope(order)) return false;
    if (paymentStatus && order.paymentStatus !== paymentStatus) return false;
    return selectedItems(order).length > 0;
  });
  const previousMs = range.to.getTime() - range.from.getTime() + 1;
  const previousFrom = new Date(range.from.getTime() - previousMs); const previousTo = new Date(range.from.getTime() - 1);
  const previousOrders = state.orders.map(normalizeOrder).filter((order) => new Date(order.createdAt) >= previousFrom && new Date(order.createdAt) <= previousTo && inUserScope(order) && (!paymentStatus || order.paymentStatus === paymentStatus) && selectedItems(order).length > 0);
  const selectedSales = (order) => selectedItems(order).reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  const selectedPaid = (order) => Number(order.total || 0) ? Number(order.paidAmount || 0) * selectedSales(order) / Number(order.total) : 0;
  const sales = orders.reduce((sum, order) => sum + selectedSales(order), 0);
  const paid = orders.reduce((sum, order) => sum + selectedPaid(order), 0);
  const hpp = orders.reduce((sum, order) => sum + selectedItems(order).reduce((lineSum, item) => lineSum + estimateItemCost(item, state), 0), 0);
  const previousSales = previousOrders.reduce((sum, order) => sum + selectedSales(order), 0);
  const dayKey = (value) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date(value));
  const maps = { days: new Map(), categories: new Map(), products: new Map(), machines: new Map(), customers: new Map(), statuses: new Map() };
  for (const order of orders) {
    const day = dayKey(order.createdAt); const dayRow = maps.days.get(day) || { label: day, orders: 0, quantity: 0, sales: 0 }; dayRow.orders += 1; dayRow.sales += selectedSales(order);
    const customerKey = `${order.customerName}|${order.phone || ""}`.toLowerCase(); const customer = maps.customers.get(customerKey) || { label: order.customerName, phone: order.phone || "", orders: 0, items: 0, sales: 0, paid: 0, lastOrderAt: order.createdAt }; customer.orders += 1; customer.sales += selectedSales(order); customer.paid += selectedPaid(order); customer.lastOrderAt = new Date(order.createdAt) > new Date(customer.lastOrderAt) ? order.createdAt : customer.lastOrderAt;
    const status = maps.statuses.get(order.status) || { id: order.status, label: STATUS_LABEL[order.status] || order.status, orders: 0, items: 0 }; status.orders += 1;
    for (const item of selectedItems(order)) {
      const product = state.products.find((row) => row.id === item.productId); const itemCost = estimateItemCost(item, state); const itemSales = Number(item.subtotal || 0); const quantity = Number(item.quantity || 1); dayRow.quantity += quantity;
      customer.items += quantity; status.items += quantity;
      const categoryName = product?.category || "Tanpa kategori"; const cat = maps.categories.get(categoryName) || { label: categoryName, orders: 0, quantity: 0, sales: 0, cost: 0 }; cat.orders += 1; cat.quantity += quantity; cat.sales += itemSales; cat.cost += itemCost; maps.categories.set(categoryName, cat);
      const prod = maps.products.get(item.productId) || { id: item.productId, label: item.productName, category: categoryName, orders: 0, quantity: 0, sales: 0, cost: 0 }; prod.orders += 1; prod.quantity += quantity; prod.sales += itemSales; prod.cost += itemCost; maps.products.set(item.productId, prod);
      for (const id of product?.machineIds || []) { const machine = state.machines.find((row) => row.id === id); const row = maps.machines.get(id) || { id, label: machine?.name || id, jobs: 0, quantity: 0, sales: 0 }; row.jobs += 1; row.quantity += quantity; row.sales += itemSales; maps.machines.set(id, row); }
    }
    maps.days.set(day, dayRow); maps.customers.set(customerKey, customer); maps.statuses.set(order.status, status);
  }
  const mask = (row) => {
    const copy = { ...row }; if (!money) { delete copy.sales; delete copy.paid; delete copy.outstanding; delete copy.previousSales; delete copy.change; delete copy.forecast30; delete copy.poNumbers; } if (!cost) { delete copy.cost; delete copy.value; delete copy.profit; delete copy.margin; } return copy;
  };
  const enrich = (row) => mask({ ...row, profit: row.sales - row.cost, margin: row.sales ? (row.sales - row.cost) / row.sales * 100 : 0 });
  const rows = orders.map((order) => {
    const items = selectedItems(order); const rowSales = selectedSales(order); const rowPaid = selectedPaid(order); const poNumbers = (order.payments || []).filter((payment) => payment.type === "PO").map((payment) => payment.poNumber).filter(Boolean); const row = { id: order.id, date: order.createdAt, code: order.code, customer: order.customerName, products: items.map((item) => item.productName).join(", "), itemCount: items.reduce((sum, item) => sum + Number(item.quantity || 1), 0), status: STATUS_LABEL[order.status], paymentStatus: order.paymentStatus, poNumbers, sales: rowSales, paid: rowPaid, outstanding: Math.max(0, rowSales - rowPaid), cost: items.reduce((sum, item) => sum + estimateItemCost(item, state), 0) }; row.profit = row.sales - row.cost; row.margin = row.sales ? row.profit / row.sales * 100 : 0; return mask(row);
  });
  const purchaseOrders = money ? orders.flatMap((order) => (order.payments || []).filter((payment) => payment.type === "PO").map((payment) => ({ orderId: order.id, code: order.code, customer: order.customerName, poNumber: payment.poNumber, createdAt: payment.createdAt, attachment: payment.poAttachment || null }))) : [];
  const topProduct = [...maps.products.values()].sort((a, b) => (money ? b.sales - a.sales : b.quantity - a.quantity))[0];
  const lowStock = state.inventory.filter((item) => Number(item.quantity) <= Number(item.minStock || 0)).length;
  const change = previousSales ? (sales - previousSales) / previousSales * 100 : null;
  const insights = [topProduct ? `${topProduct.label} menjadi produk teratas dengan ${topProduct.quantity.toLocaleString("id-ID")} unit pada periode ini.` : "Belum cukup transaksi untuk membaca tren produk.", lowStock ? `${lowStock} bahan berada pada atau di bawah stok minimum dan perlu diperiksa.` : "Tidak ada bahan yang berada di bawah stok minimum."];
  if (money && change != null) insights.unshift(`Omzet ${change >= 0 ? "naik" : "turun"} ${Math.abs(change).toFixed(1)}% dibanding periode sebelumnya.`);
  const elapsedDays = Math.max(1, Math.ceil((range.to - range.from) / 86400000)); const forecast30 = sales / elapsedDays * 30;
  if (money && sales > 0) insights.push(`Estimasi penjualan 30 hari berikutnya ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(forecast30 * .9)}–${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(forecast30 * 1.1)}, berdasarkan rata-rata periode terpilih.`);
  const inventory = state.inventory.map((item) => { const material = state.materials.find((row) => row.id === item.materialId || row.sku === item.sku); return mask({ id: item.materialId, label: item.productName, sku: item.sku, category: material?.category || item.category || "Lainnya", quantity: Number(item.quantity || 0), minStock: Number(item.minStock || 0), unit: item.unit, low: Number(item.quantity || 0) <= Number(item.minStock || 0), cost: Number(material?.cost || 0), value: Number(item.quantity || 0) * Number(material?.cost || 0) }); });
  return { range: { from: range.fromText, to: range.toText, locked: range.locked, scope: range.scope }, capabilities: { money, cost, export: hasPermission(user, "reports.export"), print: hasPermission(user, "reports.print") }, summary: mask({ orders: orders.length, items: rows.reduce((sum, row) => sum + row.itemCount, 0), sales, paid, outstanding: sales - paid, cost: hpp, profit: sales - hpp, margin: sales ? (sales - hpp) / sales * 100 : 0, previousSales, change, forecast30 }), days: [...maps.days.values()].sort((a, b) => a.label.localeCompare(b.label)).map(mask), categories: [...maps.categories.values()].sort((a, b) => b.quantity - a.quantity).map(enrich), products: [...maps.products.values()].sort((a, b) => b.quantity - a.quantity).map(enrich), machines: [...maps.machines.values()].sort((a, b) => b.jobs - a.jobs).map(mask), customers: [...maps.customers.values()].sort((a, b) => b.orders - a.orders).map(mask), statuses: [...maps.statuses.values()].sort((a, b) => b.orders - a.orders), inventory, purchaseOrders, paymentSummary: mask({ unpaid: orders.filter((order) => order.paymentStatus === "BELUM_BAYAR").length, partial: orders.filter((order) => order.paymentStatus === "BELUM_LUNAS").length, paidOrders: orders.filter((order) => order.paymentStatus === "LUNAS").length, sales, paid, outstanding: sales - paid }), rows, insights };
}

app.get("/api/reports", requirePermission("reports.view"), async (req, res, next) => {
  try { const state = await store.read(); res.json(aggregateReport(state, req.user, req.query)); } catch (error) { next(error); }
});

app.use(express.static("public"));
app.get("/{*path}", (_req, res) => res.sendFile(new URL("./public/index.html", import.meta.url).pathname));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(400).json({ error: error.message || "Terjadi kesalahan" });
});

await store.init();
await store.mutate((state) => {
  if (state.users.length) return;
  const pinSalt = crypto.randomBytes(16).toString("hex");
  state.users.push({
    id: crypto.randomUUID(), name: "Owner Manna", username: "admin", role: "OWNER",
    permissions: ROLE_PRESETS.OWNER.permissions, reportScope: "all", pinSalt,
    pinHash: hashPin(appPin || "1234", pinSalt), active: true, sessionVersion: 1,
    createdAt: now(), lastLoginAt: null
  });
});
app.listen(port, "0.0.0.0", () => console.log(`Manna POS berjalan di port ${port}`));
