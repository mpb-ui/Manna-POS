import { registerAssetRoutes } from "./lib/asset-routes.js";
import { registerAssistanceRoutes } from "./lib/assistance-routes.js";
import { workflowSnapshot, pendingChecks, checklistForOrder } from "./lib/order-assistance.js";
import { FILE_READINESS, completeness } from "./public/order-rules.js";
import { assetReport } from "./lib/assets.js";
import { aggregateReport } from "./lib/reports.js";
import { normalizeFinishingTiers } from "./public/finishing-pricing.js";
import { registerPayrollRoutes } from "./lib/payroll-routes.js";
import crypto from "node:crypto";
import express from "express";
import { addCategory, renameCategory, deleteCategory, reorderCategories, categoryKey, savePic, deletePic } from "./lib/catalog-settings.js";
import { calculateOrder, allowedNextStatus, STATUS, STATUS_LABEL } from "./lib/domain.js";
import { Store } from "./lib/store.js";
import { ATK_GROUPS } from "./lib/atk-catalog.js";
import { DTF_COLORS, DTF_SIZES, DTF_SHIRT_MATERIALS } from "./lib/dtf-catalog.js";
import { ensureShirtStock, shirtAvailability, shirtReservations } from "./lib/dtf-stock.js";
import { PERMISSIONS, ROLE_PRESETS, normalizeBriefingProfile, allowedStatusForRole, effectivePermissions, hasPermission, orderVisibleToUser, publicUser } from "./lib/access.js";

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

function requireCatalogAdmin(req, res, next) {
  return ["OWNER", "ADMIN"].includes(req.user.role) ? next() : res.status(403).json({ error: "Pengaturan ini hanya dapat diakses Admin atau Owner" });
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
  order.confirmed = Boolean(order.confirmed || order.confirmedAt || order.paymentConfirmed);
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
    const visibleMaterials = state.materials.filter((item) => !item.deletedAt);
    const materials = canStock ? structuredClone(visibleMaterials) : [];
    if (!permissions.includes("stock.value") && !permissions.includes("master.materials")) materials.forEach((item) => { delete item.cost; delete item.supplier; });
    res.json({
      currentUser: publicUser(req.user), permissions,
      assetLinks: ["OWNER", "ADMIN"].includes(req.user.role) ? assetReport(state).rows.filter(row => row.machineId && !row.cancelled).map(row => ({ id: row.id, machineId: row.machineId, name: row.name, archivedAt: row.archivedAt, disposedAt: row.disposal?.date || null, acquisitionCost: row.acquisitionCost, ...row.calculation })) : [],
      permissionCatalog: permissions.includes("users.manage") ? PERMISSIONS : [], rolePresets: permissions.includes("users.manage") ? ROLE_PRESETS : {},
      products: canCatalog ? state.products.filter((item) => item.active !== false && !item.deletedAt).map((item) => sanitizeProduct(item, req.user)) : [],
      allProducts: canMaster ? state.products.filter((item) => !item.deletedAt).map((item) => sanitizeProduct(item, req.user)) : [],
      catalogOptions: canCatalog || canMaster ? state.catalogOptions : { categories: [], saleUnits: [], priceBases: [] },
      pics: state.pics.filter((item) => item.active !== false && !item.deletedAt),
      materials, finishings: canCatalog || canMaster ? state.finishings.filter((item) => !item.deletedAt) : [], machines: canCatalog || canMaster || permissions.includes("reports.view") ? state.machines.filter((item) => !item.deletedAt) : [],
      orders: state.orders.filter((order) => orderVisibleToUser(order, req.user)).map((order) => {
        const result = sanitizeOrder(order, req.user);
        // Compact metadata for list signifiers; detailed stock/checklists are lazy.
        const checklist = checklistForOrder(order, state.products);
        result.assistanceSummary = { issueCount: completeness(order, state.products).length, checklistDone: checklist.reduce((n, i) => n + i.steps.filter(s => s.done).length, 0), checklistTotal: checklist.reduce((n, i) => n + i.steps.length, 0) };
        return result;
      }),
      inventory: canStock ? state.inventory.filter((item) => !state.materials.find((material) => material.id === item.materialId || material.sku === item.sku)?.deletedAt) : [], shirtStock: canCatalog ? shirtAvailability(state) : [], stockMovements: canStock ? state.stockMovements.slice(0, 50) : [], statusLabels: STATUS_LABEL,
      users: permissions.includes("users.manage") ? state.users.filter((item) => !item.deletedAt).map(publicUser) : [],
      auditLogs: permissions.includes("audit.view") ? state.auditLogs.slice(0, 100) : []
    });
  } catch (error) { next(error); }
});

registerPayrollRoutes(app, store, requireCatalogAdmin, audit);
registerAssetRoutes(app, store, requireCatalogAdmin, audit);
registerAssistanceRoutes(app, store, { activity, audit, normalizeOrder });

app.post("/api/catalog-options/:kind", requirePermission("master.products"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const kind = req.params.kind;
      const label = text(req.body.label);
      if (!label) throw new Error("Nama pilihan wajib diisi");
      if (kind === "categories") {
        if (!["OWNER", "ADMIN"].includes(req.user.role)) throw new Error("Kategori hanya dapat dikelola Admin atau Owner");
        const option = addCategory(state, "products", label);
        audit(state, req.user, "CATEGORY_CREATE", `Menambahkan kategori produk ${option}`);
        return { kind, option, options: state.catalogOptions };
      }
      if (kind === "saleUnits") {
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

app.put("/api/category-order", requireCatalogAdmin, async (req, res, next) => {
  try { res.json(await store.mutate((state) => {
    reorderCategories(state, req.body.categories);
    audit(state, req.user, "CATEGORY_ORDER", "Mengatur urutan tab kategori POS");
    return state.catalogOptions;
  })); } catch (error) { next(error); }
});

app.post("/api/categories/:kind", requireCatalogAdmin, async (req, res, next) => {
  try { res.status(201).json(await store.mutate((state) => {
    const name = addCategory(state, req.params.kind, req.body.name);
    audit(state, req.user, "CATEGORY_CREATE", `Menambahkan kategori ${name}`, { kind: req.params.kind });
    return { name, options: state.catalogOptions };
  })); } catch (error) { next(error); }
});

app.put("/api/categories/:kind/:name", requireCatalogAdmin, async (req, res, next) => {
  try { res.json(await store.mutate((state) => {
    const name = renameCategory(state, req.params.kind, req.params.name, req.body.name);
    audit(state, req.user, "CATEGORY_UPDATE", `Mengubah kategori ${req.params.name} menjadi ${name}`, { kind: req.params.kind });
    return { name, options: state.catalogOptions };
  })); } catch (error) { next(error); }
});

app.delete("/api/categories/:kind/:name", requireCatalogAdmin, async (req, res, next) => {
  try { res.json(await store.mutate((state) => {
    deleteCategory(state, req.params.kind, req.params.name, req.body?.replacement);
    audit(state, req.user, "CATEGORY_DELETE", `Menghapus kategori ${req.params.name}; dipindahkan ke ${req.body.replacement}`, { kind: req.params.kind });
    return { ok: true, options: state.catalogOptions };
  })); } catch (error) { next(error); }
});

app.post("/api/pics", requireCatalogAdmin, async (req, res, next) => {
  try { res.status(201).json(await store.mutate((state) => {
    const pic = savePic(state, req.body.name);
    audit(state, req.user, "PIC_CREATE", `Menambahkan PIC ${pic.name}`, { picId: pic.id });
    return pic;
  })); } catch (error) { next(error); }
});

app.put("/api/pics/:id", requireCatalogAdmin, async (req, res, next) => {
  try { res.json(await store.mutate((state) => {
    const pic = savePic(state, req.body.name, req.params.id);
    audit(state, req.user, "PIC_UPDATE", `Memperbarui PIC ${pic.name}`, { picId: pic.id });
    return pic;
  })); } catch (error) { next(error); }
});

app.delete("/api/pics/:id", requireCatalogAdmin, async (req, res, next) => {
  try { res.json(await store.mutate((state) => {
    deletePic(state, req.params.id);
    audit(state, req.user, "PIC_DELETE", "Menghapus PIC dari pilihan penugasan baru", { picId: req.params.id });
    return { ok: true };
  })); } catch (error) { next(error); }
});

app.post("/api/materials", requirePermission("master.materials"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const name = text(req.body.name); const sku = text(req.body.sku).toUpperCase();
      if (!name || !sku || !text(req.body.unit)) throw new Error("Nama, SKU, dan satuan bahan wajib diisi");
      if (!state.catalogOptions.materialCategories.includes(text(req.body.category) || "Lainnya")) throw new Error("Pilih kategori bahan yang tersedia");
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
      const material = state.materials.find((item) => item.id === req.params.id && !item.deletedAt);
      if (!material) throw new Error("Bahan tidak ditemukan");
      const name = text(req.body.name); const sku = text(req.body.sku).toUpperCase(); const unit = text(req.body.unit);
      if (!name || !sku || !unit) throw new Error("Nama, SKU, dan satuan bahan wajib diisi");
      if (!state.catalogOptions.materialCategories.includes(text(req.body.category) || "Lainnya")) throw new Error("Pilih kategori bahan yang tersedia");
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
      if (categories.some((category) => !state.catalogOptions.categories.includes(category))) throw new Error("Kategori finishing tidak tersedia");
      unique(state, "finishings", "code", code); unique(state, "finishings", "name", name);
      const finishing = { id: identifier("fin", code), code, name, categories, price: Math.max(0, Number(req.body.price || 0)), rule: text(req.body.rule) || "free", active: req.body.active !== false };
      finishing.priceTiers = normalizeFinishingTiers(req.body.priceTiers ?? []);
      state.finishings.push(finishing); audit(state, req.user, "FINISHING_CREATE", `Menambahkan finishing ${name}`, { finishingId: finishing.id }); return finishing;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.put("/api/finishings/:id", requirePermission("master.finishings"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const finishing = state.finishings.find((item) => item.id === req.params.id && !item.deletedAt);
      if (!finishing) throw new Error("Finishing tidak ditemukan");
      const name = text(req.body.name); const code = text(req.body.code).toUpperCase();
      const categories = [...new Set(req.body.categories || [])].map(text).filter(Boolean);
      if (!name || !code || !categories.length) throw new Error("Nama, kode, dan minimal satu kategori finishing wajib diisi");
      if (categories.some((category) => !state.catalogOptions.categories.includes(category))) throw new Error("Kategori finishing tidak tersedia");
      unique(state, "finishings", "code", code, finishing.id); unique(state, "finishings", "name", name, finishing.id);
      const priceTiers = normalizeFinishingTiers(req.body.priceTiers ?? finishing.priceTiers ?? []);
      Object.assign(finishing, { priceTiers, code, name, categories, price: Math.max(0, Number(req.body.price || 0)), rule: text(req.body.rule) || "free", active: req.body.active !== false });
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
      const machine = state.machines.find((item) => item.id === req.params.id && !item.deletedAt);
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
  if (current?.dtfShirt) throw new Error("Ubah harga Sablon Kaos melalui form paket sablon");
  const name = text(body.name); const sku = text(body.sku).toUpperCase();
  const price = Math.max(0, Number(body.price || 0)); const baseCost = Math.max(0, Number(body.baseCost || 0));
  if (!name || !sku || !text(body.category) || !price) throw new Error("Nama, SKU, kategori, dan harga jual wajib diisi");
  unique(state, "products", "sku", sku, current?.id); unique(state, "products", "name", name, current?.id);
  const category = text(body.category);
  if (!state.catalogOptions.categories.includes(category)) throw new Error("Pilih kategori produk yang tersedia");
  const categoryId = categoryKey(state.catalogOptions, category);
  const retailAtK = categoryId === "atk" && (body.retailAtK === true || body.retailAtK === "true");
  const quickSale = ["akrilik", "stempel"].includes(categoryId);
  const simpleSale = retailAtK || quickSale;
  const atkGroup = categoryId === "atk" ? (ATK_GROUPS.includes(text(body.atkGroup)) ? text(body.atkGroup) : "Peralatan lainnya") : "";
  const barcode = categoryId === "atk" ? text(body.barcode === undefined ? current?.barcode : body.barcode) : "";
  if (barcode.length > 128) throw new Error("Barcode maksimal 128 karakter");
  if (barcode && state.products.some((item) => item.id !== current?.id && categoryKey(state.catalogOptions, item.category) === "atk" && item.barcode === barcode)) {
    throw new Error("Barcode ATK sudah digunakan produk lain");
  }
  const basisOption = state.catalogOptions.priceBases.find((item) => item.id === body.priceBasisId || item.label === body.priceBasisLabel);
  const priceBasis = simpleSale ? "unit" : ["unit", "sqm", "linear_m"].includes(body.priceBasis) ? body.priceBasis : basisOption?.mode || "unit";
  const priceBasisLabel = simpleSale ? "Per unit" : basisOption?.label || text(body.priceBasisLabel) || ({ unit: "Per unit", sqm: "Luas m²", linear_m: "Meter lari" }[priceBasis]);
  const saleUnit = text(body.saleUnit) || "pcs";
  const hasMaterialVariants = body.hasMaterialVariants === undefined ? Boolean(current?.hasMaterialVariants) : body.hasMaterialVariants === true;
  const sourceIds = new Set();
  const materialSources = (simpleSale && !hasMaterialVariants ? [] : body.materialSources || []).filter((source) => Number(source.quantity) > 0).map((source) => {
    const material = state.materials.find((item) => item.id === source.materialId);
    if (!material || material.active === false) throw new Error("Pilih bahan aktif yang valid");
    if (sourceIds.has(material.id)) throw new Error("Bahan yang sama tidak boleh ditambahkan dua kali");
    sourceIds.add(material.id);
    return { materialId: material.id, sku: material.sku, name: material.name, unit: material.unit, quantity: Number(source.quantity), wastePercent: Math.max(0, Number(source.wastePercent || 0)) };
  });
  const validateSources = (sources, label) => {
    if (!Array.isArray(sources)) throw new Error(`Sumber bahan ${label} tidak valid`);
    const used = new Set();
    return sources.map((source) => {
      const material = state.materials.find((item) => item.id === source.materialId && item.active !== false);
      const quantity = Number(source.quantity); const wastePercent = Number(source.wastePercent || 0);
      if (!material || used.has(material.id) || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(wastePercent) || wastePercent < 0) {
        throw new Error(`Bahan, jumlah, atau waste tidak valid pada ${label}`);
      }
      used.add(material.id);
      return { materialId: material.id, sku: material.sku, name: material.name, unit: material.unit, cost: Number(material.cost || 0), quantity, wastePercent };
    });
  };
  const updateVariants = (existing, submitted, label, key) => {
    if (submitted === undefined) return existing;
    if (!Array.isArray(submitted) || submitted.length !== existing.length) throw new Error(`Daftar ${label} tidak valid`);
    const byId = new Map(submitted.map((item) => [String(item[key]), item]));
    if (byId.size !== existing.length || existing.some((item) => !byId.has(String(item[key])))) throw new Error(`Pilihan ${label} tidak valid`);
    return existing.map((item) => ({ ...item, materialSources: validateSources(byId.get(String(item[key])).materialSources, item.label || label) }));
  };
  const fixedSizeVariants = updateVariants(current?.fixedSizeVariants || [], body.fixedSizeVariants, "varian tetap", "id");
  const sizeVariants = updateVariants(current?.sizeVariants || [], body.sizeVariants, "ukuran template", "id");
  const submittedMaterialVariants = hasMaterialVariants ? (body.materialVariants === undefined ? current?.materialVariants : body.materialVariants) : [];
  if (!Array.isArray(submittedMaterialVariants) || submittedMaterialVariants.length > 40 || (hasMaterialVariants && !submittedMaterialVariants.length)) {
    throw new Error("Tambahkan minimal satu varian bahan (maksimal 40)");
  }
  const variantIds = new Set(); const variantLabels = new Set();
  const submittedSubVariants = hasMaterialVariants ? (body.subVariants === undefined ? current?.subVariants || [] : body.subVariants) : [];
  if (!Array.isArray(submittedSubVariants) || submittedSubVariants.length > 10) throw new Error("Maksimal 10 sub-varian");
  const subIds = new Set(); const subLabels = new Set();
  const subVariants = submittedSubVariants.map((item) => {
    const id = text(item.id); const label = text(item.label);
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || !label || label.length > 100 || subIds.has(id) || subLabels.has(label.toLowerCase())) throw new Error("Sub-varian tidak valid/duplikat");
    subIds.add(id); subLabels.add(label.toLowerCase()); return { id, label };
  });
  const optionalTiers = (tiers, retailPrice) => {
    if (tiers === undefined || (Array.isArray(tiers) && !tiers.length)) return [];
    if (!Array.isArray(tiers) || tiers.length > 10) throw new Error("Maksimal 10 tingkat harga grosir per pilihan");
    return normalizeTiers({ wholesaleEnabled: true, priceTiers: tiers }, retailPrice);
  };
  const materialVariants = submittedMaterialVariants.map((variant) => {
    const id = text(variant.id); const label = text(variant.label);
    const priceOverride = variant.price === "" || variant.price == null ? null : Number(variant.price);
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || !label || label.length > 100 || variantIds.has(id) || variantLabels.has(label.toLowerCase()) ||
      (priceOverride !== null && (!Number.isSafeInteger(priceOverride) || priceOverride <= 0))) throw new Error("ID, nama, atau harga varian bahan tidak valid/duplikat");
    variantIds.add(id); variantLabels.add(label.toLowerCase());
    const sources = validateSources(variant.materialSources, label);
    if (!sources.length) throw new Error(`Tambahkan minimal satu bahan untuk varian ${label}`);
    const variantRetail = priceOverride ?? price;
    const priceTiers = optionalTiers(variant.priceTiers, variantRetail);
    const submittedCombinations = subVariants.length ? variant.combinations : [];
    if (!Array.isArray(submittedCombinations) || submittedCombinations.length !== subVariants.length) throw new Error(`Harga sub-varian untuk ${label} belum lengkap`);
    const bySub = new Map(submittedCombinations.map((item) => [item.subVariantId, item]));
    if (bySub.size !== subVariants.length || subVariants.some((item) => !bySub.has(item.id))) throw new Error(`Kombinasi sub-varian untuk ${label} tidak valid`);
    const combinations = subVariants.map((sub) => {
      const input = bySub.get(sub.id);
      const combinationPrice = input.price === "" || input.price == null ? null : Number(input.price);
      if (combinationPrice !== null && (!Number.isSafeInteger(combinationPrice) || combinationPrice <= 0)) throw new Error(`Harga ${label} · ${sub.label} tidak valid`);
      return { subVariantId: sub.id, price: combinationPrice, active: input.active !== false,
        priceTiers: optionalTiers(input.priceTiers, combinationPrice ?? variantRetail) };
    });
    if (subVariants.length && !combinations.some((item) => item.active)) throw new Error(`Aktifkan minimal satu pilihan pada ${label}`);
    return { id, label, price: priceOverride, priceTiers, combinations, materialSources: sources };
  });
  let choiceGroups = current?.choiceGroups || [];
  if (body.choiceGroups !== undefined) {
    if (!Array.isArray(body.choiceGroups) || body.choiceGroups.length !== choiceGroups.length) throw new Error("Kelompok pilihan bahan tidak valid");
    const groups = new Map(body.choiceGroups.map((group) => [group.id, group]));
    if (groups.size !== choiceGroups.length || choiceGroups.some((group) => !groups.has(group.id))) throw new Error("Kelompok pilihan bahan tidak valid");
    choiceGroups = choiceGroups.map((group) => {
      const submitted = groups.get(group.id).options;
      if (!Array.isArray(submitted) || submitted.length !== group.options.length) throw new Error(`Pilihan ${group.label} tidak valid`);
      const options = new Map(submitted.map((option) => [option.id, option]));
      if (options.size !== group.options.length || group.options.some((option) => !options.has(option.id))) throw new Error(`Pilihan ${group.label} tidak valid`);
      return { ...group, options: group.options.map((option) => {
        const selected = options.get(option.id);
        const material = state.materials.find((item) => item.id === selected.materialId && item.active !== false);
        const quantity = Number(selected.quantity);
        if (!material || !Number.isFinite(quantity) || quantity <= 0) throw new Error(`Bahan atau jumlah untuk ${option.label} tidak valid`);
        return { ...option, materialId: material.id, sku: material.sku, name: material.name, unit: material.unit, cost: Number(material.cost || 0), quantity };
      }) };
    });
  }
  if (current?.id === "display-x-banner" && fixedSizeVariants.some((variant) => !variant.materialSources?.length)) throw new Error("Semua varian X-Banner wajib memiliki sumber bahan");
  if (!materialSources.length && !hasMaterialVariants && !simpleSale && !current?.groupedProduct && !current?.a3Kind) throw new Error("Produk wajib memiliki minimal satu sumber bahan");
  const machineIds = simpleSale ? [] : [...new Set(body.machineIds || [])].filter((id) => state.machines.some((machine) => machine.id === id && machine.active !== false));
  if (!machineIds.length && !current && !simpleSale) throw new Error("Pilih minimal satu mesin");
  const unitLabels = { pcs: "/pcs", lbr: "/lembar", "m²": "/m²", pack: "/pack", rim: "/rim", set: "/set", "m lari": "/m lari" };
  const a3Kind = categoryId === "print-a3" ? current?.a3Kind : null;
  const finishingIds = [...new Set(simpleSale ? [] : body.finishingIds || [])].filter((id) => {
    if (!state.finishings.some((item) => item.id === id && item.active !== false && item.categories.includes(text(body.category)))) return false;
    if (a3Kind === "sticker") return id.startsWith("fin-a3-sticker-");
    if (a3Kind === "ready") return current.a3ReadyType === "card" ? id.startsWith("fin-a3-card-")
      : current.a3ReadyType === "nota" ? id === "fin-a3-nota-design" : false;
    if (a3Kind === "paper") return !id.startsWith("fin-a3-sticker-") && id !== "fin-a3-two-side" &&
      !id.startsWith("fin-a3-card-") && id !== "fin-a3-nota-design" &&
      !(id.startsWith("fin-a3-lam-") && !id.endsWith(current.a3Side === "1S" ? "-1" : "-2"));
    return true;
  });
  const finishing = finishingIds.map((id) => structuredClone(state.finishings.find((item) => item.id === id)));
  const product = { id: current?.id || identifier("prd", sku), sku, name, category, retailAtK, quickSale, atkGroup, barcode, baseCost, price, priceBasis, priceBasisLabel, saleUnit, unitName: saleUnit, unitLabel: unitLabels[saleUnit] || `/${saleUnit}`, widths: priceBasis === "unit" ? [] : (body.widths || []).map(Number).filter((value) => value > 0), billingIncrement: ["lf-poster", "lf-sticker"].includes(categoryId) ? 0.1 : Number(current?.billingIncrement || 0.5), areaPerUnit: Number(current?.areaPerUnit || 0), note: text(body.note), featured: Boolean(body.featured), recommendation: text(body.recommendation) || "Produk pilihan", active: body.active !== false, wholesaleEnabled: Boolean(body.wholesaleEnabled), priceTiers: normalizeTiers(body, price), discount: normalizeDiscount(body), materialSources, hasMaterialVariants, materialVariants, subVariants, subVariantLabel: subVariants.length ? text(body.subVariantLabel || current?.subVariantLabel || "Sub-varian").slice(0, 80) : "", machineIds, finishingIds, finishing, templateProduct: Boolean(current?.templateProduct), sizeVariants, designTemplates: current?.designTemplates || [], fixedSizeVariants, groupedProduct: Boolean(current?.groupedProduct), choiceGroups, cardPrice: Number(current?.cardPrice || 0), a3Kind, a3ReadyType: a3Kind === "ready" ? current?.a3ReadyType : null, a3ReadyGroup: a3Kind === "ready" ? current?.a3ReadyGroup : null, a3Family: a3Kind ? current?.a3Family : null, a3Variant: a3Kind ? current?.a3Variant : null, a3Size: a3Kind ? current?.a3Size : null, a3Side: a3Kind ? current?.a3Side : null, dtfShirt: Boolean(current?.dtfShirt), dtfPackages: current?.dtfPackages || [] };
  if (priceBasis !== "unit" && !product.widths.length) throw new Error("Tambahkan minimal satu pilihan lebar bahan");
  if (current) Object.assign(current, product); else state.products.push(product);
  return product;
}

app.post("/api/products", requirePermission("master.products"), async (req, res, next) => {
  try { const result = await store.mutate((state) => { const product = saveProduct(state, req.body); audit(state, req.user, "PRODUCT_CREATE", `Menambahkan produk ${product.name}`, { productId: product.id, price: product.price }); return product; }); res.status(201).json(result); } catch (error) { next(error); }
});
app.put("/api/products/:id", requirePermission("master.products"), async (req, res, next) => {
  try { const result = await store.mutate((state) => { const product = state.products.find((item) => item.id === req.params.id && !item.deletedAt); if (!product) throw new Error("Produk tidak ditemukan"); const beforePrice = product.price; const saved = saveProduct(state, req.body, product); audit(state, req.user, "PRODUCT_UPDATE", `Memperbarui produk ${saved.name}`, { productId: saved.id, beforePrice, price: saved.price }); return saved; }); res.json(result); } catch (error) { next(error); }
});

app.put("/api/products/:id/dtf-packages", requirePermission("master.products"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const product = state.products.find((item) => item.id === req.params.id && item.dtfShirt && !item.deletedAt);
      if (!product) throw new Error("Produk Sablon Kaos tidak ditemukan");
      const submitted = req.body.packages;
      if (!Array.isArray(submitted) || submitted.length !== product.dtfPackages.length) throw new Error("Semua paket sablon wajib diisi");
      const byId = new Map(submitted.map((item) => [item.id, Number(item.price)]));
      if (byId.size !== product.dtfPackages.length || product.dtfPackages.some((item) => !Number.isSafeInteger(byId.get(item.id)) || byId.get(item.id) <= 0)) throw new Error("Harga paket sablon tidak valid");
      if (req.body.stockVariants !== undefined) {
        const variants = req.body.stockVariants;
        const combinations = DTF_COLORS.flatMap((color) => DTF_SIZES.map((size) => `${color}:${size}`));
        if (!Array.isArray(variants) || variants.length !== combinations.length) throw new Error("Semua varian kaos wajib dihubungkan ke bahan");
        const byCombination = new Map(variants.map((variant) => [`${variant.color}:${variant.size}`, variant.materialId]));
        if (byCombination.size !== combinations.length || combinations.some((key) => !byCombination.has(key))) throw new Error("Pilihan warna dan ukuran tidak valid");
        const selectedMaterials = [...byCombination.values()];
        if (new Set(selectedMaterials).size !== selectedMaterials.length || selectedMaterials.some((id) => !DTF_SHIRT_MATERIALS.some((material) => material.id === id && state.materials.some((item) => item.id === id && item.active !== false)))) throw new Error("Pilih satu bahan kaos aktif yang berbeda untuk setiap varian");
        product.dtfStockVariants = variants.map(({ color, size, materialId }) => ({ color, size, materialId }));
      }
      product.dtfPackages = product.dtfPackages.map((item) => ({ ...item, price: byId.get(item.id) }));
      product.price = Math.min(...product.dtfPackages.map((item) => item.price));
      product.active = req.body.active !== false;
      product.featured = Boolean(req.body.featured);
      audit(state, req.user, "PRODUCT_UPDATE", "Memperbarui harga paket Sablon Kaos", { productId: product.id });
      return product;
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.post("/api/orders", requirePermission("pos.create"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const priced = calculateOrder(state.products.filter((item) => item.active !== false && !item.deletedAt), req.body.items || []);
      if (!priced.items.length) throw new Error("Pesanan belum memiliki produk");
      if (!String(req.body.customerName || "").trim()) throw new Error("Nama pelanggan wajib diisi");
      const order = {
        id: crypto.randomUUID(),
        code: orderCode(state.nextOrderNumber++),
        customerName: String(req.body.customerName).trim(),
        phone: String(req.body.phone || "").trim(),
        deadline: req.body.deadline || null,
        fileStatus: req.body.fileStatus || "SIAP_CETAK",
        fileReadiness: FILE_READINESS.includes(req.body.fileReadiness) ? req.body.fileReadiness : "UNCONFIRMED",
        confirmed: req.body.confirmed === true,
        confirmedAt: req.body.confirmed === true ? now() : null,
        designPic: "",
        paidAmount: 0,
        payments: [],
        paymentConfirmed: false,
        paymentStatus: "BELUM_BAYAR",
        status: STATUS.WAITING_PAYMENT,
        createdById: req.user.id,
        createdByName: req.user.name,
        stockCommitted: false,
        items: workflowSnapshot(priced.items, state.products),
        total: priced.total,
        createdAt: now(),
        statusEnteredAt: now(),
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
      const priced = calculateOrder(state.products.filter((item) => item.active !== false && !item.deletedAt), req.body.items || []);
      if (!priced.items.length) throw new Error("Pesanan belum memiliki produk");
      if (!String(req.body.customerName || "").trim()) throw new Error("Nama pelanggan wajib diisi");
      order.customerName = String(req.body.customerName).trim();
      order.phone = String(req.body.phone || "").trim();
      order.deadline = req.body.deadline || null;
      order.fileStatus = req.body.fileStatus || "SIAP_CETAK";
      order.fileReadiness = FILE_READINESS.includes(req.body.fileReadiness) ? req.body.fileReadiness : "UNCONFIRMED";
      if (req.body.confirmed === true) { order.confirmed = true; order.confirmedAt ||= now(); }
      order.items = workflowSnapshot(priced.items, state.products);
      order.productionChecks = {};
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
      if (!order.paymentConfirmed) ensureShirtStock(state, order);
      if (poAttachment) {
        if (!/^image\/(png|jpe?g|webp)$/i.test(String(poAttachment.type || ""))) throw new Error("File PO harus berupa gambar JPG, PNG, atau WebP");
        if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(String(poAttachment.dataUrl || ""))) throw new Error("Data gambar PO tidak valid");
        if (String(poAttachment.dataUrl).length > 3_500_000) throw new Error("Ukuran gambar PO maksimal 2,5 MB");
      }
      const payment = { id: crypto.randomUUID(), method, type, amount, poNumber, poAttachment: poAttachment ? { name: text(poAttachment.name), type: text(poAttachment.type), dataUrl: poAttachment.dataUrl } : null, createdAt: now() };
      order.payments.push(payment);
      order.paidAmount += amount;
      order.paymentConfirmed = true;
      order.confirmed = true; order.confirmedAt ||= now();
      order.paymentStatus = order.paidAmount >= order.total ? "LUNAS" : "BELUM_LUNAS";
      if (order.status === STATUS.WAITING_PAYMENT) { order.status = STATUS.DESIGN; order.statusEnteredAt = now(); }
      order.updatedAt = now();
      activity(state, order, `${type === "PO" ? `Pembayaran PO ${poNumber}` : `Pembayaran ${method}`} dicatat`, req.user.name);
      audit(state, req.user, "PAYMENT_CREATE", `Mencatat pembayaran ${order.code}`, { orderId: order.id, type, method, amount });
      return order;
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.patch("/api/orders/:id/deadline", async (req, res, next) => {
  if (!["OWNER", "CASHIER", "MANAGER"].includes(req.user.role) || req.user.role === "MANAGER" && !hasPermission(req.user, "pos.edit")) return res.status(403).json({ error: "Deadline hanya dapat diubah Owner, Kasir, atau Manager dengan akses edit pesanan" });
  try {
    const value = req.body.deadline;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("Tanggal dan jam deadline tidak valid");
    const deadline = new Date(value).toISOString();
    const result = await store.mutate((state) => {
      const order = state.orders.find((item) => item.id === req.params.id);
      if (!order || !orderVisibleToUser(order, req.user)) throw new Error("Pesanan tidak ditemukan");
      normalizeOrder(order);
      if (order.deadline && Date.parse(order.deadline) === Date.parse(deadline)) return sanitizeOrder(order, req.user);
      const previous = order.deadline || null;
      const format = (date) => date ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar" }).format(new Date(date)) + " WITA" : "Tidak ditentukan";
      order.deadline = deadline; order.updatedAt = now();
      activity(state, order, `Deadline diubah: ${format(previous)} → ${format(deadline)}`, req.user.name);
      audit(state, req.user, "ORDER_DEADLINE", `Mengubah deadline ${order.code}`, { orderId: order.id, previousDeadline: previous, deadline });
      return sanitizeOrder(order, req.user);
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
      const pic = state.pics.find((item) => item.name === designPic && item.active !== false && !item.deletedAt);
      if (!pic) throw new Error("PIC tidak tersedia");
      order.designPic = pic.name;
      order.designPicId = pic.id;
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
      if (order.hold) { const error = new Error("Pesanan masih tertahan. Lepaskan penanda setelah kendala selesai."); error.code = "ORDER_HELD"; throw error; }
      if (target !== allowedNextStatus(order.status)) throw new Error("Perpindahan status tidak valid");
      if (!allowedStatusForRole(req.user.role, order.status, target)) throw new Error("Role Anda tidak dapat memindahkan status ini");
      const unpaidPickup = target === STATUS.PICKED_UP && Number(order.paidAmount || 0) < Number(order.total || 0);
      if (unpaidPickup && req.body.confirmUnpaid !== true) {
        const error = new Error("Pesanan belum lunas"); error.code = "UNPAID_PICKUP_CONFIRMATION"; throw error;
      }
      if (order.status === STATUS.DESIGN && !order.designPic) throw new Error("Nama PIC Operator Design wajib diisi");
      const unchecked = pendingChecks(order, state.products);
      if (req.body.confirmChecklist === true && unchecked.length) activity(state, order, `${unchecked.length} langkah checklist belum diperiksa; kelanjutan dikonfirmasi`, req.user.name);
      if (unpaidPickup) activity(state, order, "Penerimaan pesanan belum lunas dikonfirmasi; sisa pembayaran tetap tercatat", req.user.name);
      order.status = target;
      order.statusEnteredAt = now();
      order.updatedAt = now();
      if (target === STATUS.DONE && !order.stockCommitted) {
        ensureShirtStock(state, order, { physical: true });
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
      return sanitizeOrder(order, req.user);
    });
    res.json(result);
  } catch (error) { if (["UNPAID_PICKUP_CONFIRMATION", "ORDER_HELD"].includes(error.code)) return res.status(409).json({ error: error.message, code: error.code }); next(error); }
});

app.patch("/api/inventory/:sku", requirePermission("stock.adjust"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const stock = state.inventory.find((item) => item.sku === req.params.sku);
      if (!stock) throw new Error("Item stok tidak ditemukan");
      if (state.materials.some((item) => (item.id === stock.materialId || item.sku === stock.sku) && item.deletedAt)) throw new Error("Bahan sudah dihapus");
      const change = Number(req.body.change);
      if (!Number.isFinite(change) || change === 0) throw new Error("Jumlah penyesuaian tidak valid");
      if (categoryKey(state.catalogOptions, stock.category, "materials") === "kaos-polos-dtf") {
        const reserved = shirtReservations(state).get(stock.materialId) || 0;
        if (Number(stock.quantity) + change < reserved) throw new Error(`Stok ${stock.productName} tidak boleh kurang dari ${reserved} pcs yang sudah dipesan`);
      }
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
      const user = { id: crypto.randomUUID(), name, username, role, permissions: normalizePermissions(Array.isArray(req.body.permissions) ? req.body.permissions : ROLE_PRESETS[role].permissions), reportScope: req.body.reportScope || ROLE_PRESETS[role].reportScope, briefingProfile: normalizeBriefingProfile(req.body.briefingProfile), pinSalt, pinHash: hashPin(pin, pinSalt), active: req.body.active !== false, sessionVersion: 1, createdAt: now(), lastLoginAt: null };
      state.users.push(user); audit(state, req.user, "USER_CREATE", `Membuat user ${name}`, { targetUserId: user.id, role });
      return publicUser(user);
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.put("/api/users/:id", requirePermission("users.manage"), async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const user = state.users.find((item) => item.id === req.params.id && !item.deletedAt); if (!user) throw new Error("User tidak ditemukan");
      const name = text(req.body.name); const username = text(req.body.username).toLowerCase();
      const role = ROLE_PRESETS[req.body.role] ? req.body.role : user.role;
      if (!name || !username) throw new Error("Nama dan username wajib diisi");
      if (state.users.some((item) => item.id !== user.id && item.username.toLowerCase() === username)) throw new Error("Username sudah digunakan");
      if (user.id === req.user.id && req.body.active === false) throw new Error("Anda tidak dapat menonaktifkan akun sendiri");
      if (user.role === "OWNER" && role !== "OWNER" && state.users.filter((item) => item.role === "OWNER" && item.active !== false).length <= 1) throw new Error("Minimal satu Owner aktif harus tersedia");
      const permissions = normalizePermissions(Array.isArray(req.body.permissions) ? req.body.permissions : ROLE_PRESETS[role].permissions);
      if (user.id === req.user.id && !permissions.includes("users.manage")) throw new Error("Akses kelola user tidak dapat dicabut dari akun yang sedang digunakan");
      Object.assign(user, { name, username, role, permissions, reportScope: req.body.reportScope || ROLE_PRESETS[role].reportScope, briefingProfile: normalizeBriefingProfile(req.body.briefingProfile ?? user.briefingProfile), active: req.body.active !== false });
      const pin = String(req.body.pin || "");
      if (pin) { if (pin.length < 4) throw new Error("PIN minimal 4 digit"); user.pinSalt = crypto.randomBytes(16).toString("hex"); user.pinHash = hashPin(pin, user.pinSalt); user.sessionVersion = Number(user.sessionVersion || 1) + 1; }
      audit(state, req.user, "USER_UPDATE", `Memperbarui user ${name}`, { targetUserId: user.id, role, pinChanged: Boolean(pin) });
      return publicUser(user);
    });
    res.json(result);
  } catch (error) { next(error); }
});

function materialUsedByProduct(product, materialId) {
  const sources = [product.materialSources, ...(product.fixedSizeVariants || []).map((item) => item.materialSources),
    ...(product.sizeVariants || []).map((item) => item.materialSources), ...(product.materialVariants || []).map((item) => item.materialSources)];
  return sources.some((rows) => (rows || []).some((source) => source.materialId === materialId)) ||
    (product.choiceGroups || []).some((group) => (group.options || []).some((option) => option.materialId === materialId)) ||
    (product.dtfStockVariants || []).some((variant) => variant.materialId === materialId);
}

function archiveRecord(state, collection, id, user, action, label) {
  const item = state[collection].find((row) => row.id === id && !row.deletedAt);
  if (!item) throw new Error(`${label} tidak ditemukan`);
  item.active = false;
  item.deletedAt = now();
  audit(state, user, action, `Menghapus ${label.toLowerCase()} ${item.name}`, { targetId: item.id });
  return { ok: true, id: item.id };
}

app.delete("/api/products/:id", requirePermission("master.products"), async (req, res, next) => {
  try { res.json(await store.mutate((state) => archiveRecord(state, "products", req.params.id, req.user, "PRODUCT_DELETE", "Produk"))); }
  catch (error) { next(error); }
});

app.delete("/api/materials/:id", requirePermission("master.materials"), async (req, res, next) => {
  try {
    res.json(await store.mutate((state) => {
      const material = state.materials.find((item) => item.id === req.params.id && !item.deletedAt);
      if (!material) throw new Error("Bahan tidak ditemukan");
      const product = state.products.find((item) => item.active !== false && !item.deletedAt && materialUsedByProduct(item, material.id));
      if (product) throw new Error(`Bahan masih digunakan produk aktif ${product.name}. Pindahkan bahan pada produk terlebih dahulu.`);
      const finishing = state.finishings.find((item) => item.active !== false && !item.deletedAt && item.materialId === material.id);
      if (finishing) throw new Error(`Bahan masih digunakan finishing ${finishing.name}. Ubah atau hapus finishing terlebih dahulu.`);
      const stock = state.inventory.find((item) => item.materialId === material.id || item.sku === material.sku);
      if (Number(stock?.quantity || 0) !== 0) throw new Error("Stok bahan harus nol sebelum dihapus. Sesuaikan stok terlebih dahulu.");
      if (state.orders.some((order) => ![STATUS.DONE, STATUS.PICKED_UP].includes(order.status) &&
        (order.items || []).some((item) => (item.materials || []).some((source) => source.materialId === material.id)))) {
        throw new Error("Bahan masih dipakai pesanan yang belum Selesai.");
      }
      return archiveRecord(state, "materials", material.id, req.user, "MATERIAL_DELETE", "Bahan");
    }));
  } catch (error) { next(error); }
});

app.delete("/api/finishings/:id", requirePermission("master.finishings"), async (req, res, next) => {
  try { res.json(await store.mutate((state) => archiveRecord(state, "finishings", req.params.id, req.user, "FINISHING_DELETE", "Finishing"))); }
  catch (error) { next(error); }
});

app.delete("/api/machines/:id", requirePermission("master.machines"), async (req, res, next) => {
  try {
    res.json(await store.mutate((state) => {
      const product = state.products.find((item) => item.active !== false && !item.deletedAt && (item.machineIds || []).includes(req.params.id));
      if (product) throw new Error(`Mesin masih digunakan produk aktif ${product.name}. Ganti mesin produk terlebih dahulu.`);
      return archiveRecord(state, "machines", req.params.id, req.user, "MACHINE_DELETE", "Mesin");
    }));
  } catch (error) { next(error); }
});

app.delete("/api/users/:id", requirePermission("users.manage"), async (req, res, next) => {
  try {
    res.json(await store.mutate((state) => {
      const user = state.users.find((item) => item.id === req.params.id && !item.deletedAt);
      if (!user) throw new Error("User tidak ditemukan");
      if (user.id === req.user.id) throw new Error("Anda tidak dapat menghapus akun sendiri");
      if (user.role === "OWNER" && user.active !== false && state.users.filter((item) => item.role === "OWNER" && item.active !== false && !item.deletedAt).length <= 1) {
        throw new Error("Minimal satu Owner aktif harus tersedia");
      }
      user.sessionVersion = Number(user.sessionVersion || 1) + 1;
      return archiveRecord(state, "users", user.id, req.user, "USER_DELETE", "User");
    }));
  } catch (error) { next(error); }
});


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
