import crypto from "node:crypto";
import express from "express";
import { calculateOrder, allowedNextStatus, STATUS, STATUS_LABEL } from "./lib/domain.js";
import { Store } from "./lib/store.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const appPin = process.env.APP_PIN || "";
const sessionSecret = process.env.SESSION_SECRET || "manna-pos-local-development";
const store = new Store(process.env.DATABASE_URL);

app.use(express.json({ limit: "1mb" }));

function signature() {
  return crypto.createHmac("sha256", sessionSecret).update("manna-pos-authenticated").digest("hex");
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }));
}

function isAuthenticated(req) {
  if (!appPin) return true;
  return parseCookies(req.headers.cookie).manna_session === signature();
}

app.get("/api/health", (_req, res) => res.json({ ok: true, database: process.env.DATABASE_URL ? "postgres" : "memory" }));
app.get("/api/session", (req, res) => res.json({ authenticated: isAuthenticated(req), pinRequired: Boolean(appPin) }));
app.post("/api/login", (req, res) => {
  if (!appPin || String(req.body.pin || "") === appPin) {
    res.setHeader("Set-Cookie", `manna_session=${signature()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    return res.json({ ok: true });
  }
  res.status(401).json({ error: "PIN tidak sesuai" });
});

app.use("/api", (req, res, next) => isAuthenticated(req) ? next() : res.status(401).json({ error: "Sesi berakhir" }));

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

app.get("/api/bootstrap", async (_req, res, next) => {
  try {
    const state = await store.read();
    state.orders.forEach(normalizeOrder);
    res.json({ products: state.products.filter((item) => item.active !== false), allProducts: state.products, materials: state.materials, finishings: state.finishings, machines: state.machines, orders: state.orders, inventory: state.inventory, stockMovements: state.stockMovements.slice(0, 50), statusLabels: STATUS_LABEL });
  } catch (error) { next(error); }
});

app.post("/api/materials", async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const name = text(req.body.name); const sku = text(req.body.sku).toUpperCase();
      if (!name || !sku || !text(req.body.unit)) throw new Error("Nama, SKU, dan satuan bahan wajib diisi");
      unique(state, "materials", "sku", sku); unique(state, "materials", "name", name);
      const material = { id: identifier("mat", sku), sku, name, category: text(req.body.category) || "Lainnya", unit: text(req.body.unit), stock: Math.max(0, Number(req.body.stock || 0)), minStock: Math.max(0, Number(req.body.minStock || 0)), cost: Math.max(0, Number(req.body.cost || 0)), supplier: text(req.body.supplier), active: req.body.active !== false };
      state.materials.push(material);
      state.inventory.push({ sku, materialId: material.id, productName: name, width: null, quantity: material.stock, minStock: material.minStock, unit: material.unit, updatedAt: now() });
      return material;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.put("/api/materials/:id", async (req, res, next) => {
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
      if (stock) Object.assign(stock, { sku, materialId: material.id, productName: name, minStock: material.minStock, unit, updatedAt: now() });
      return material;
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.post("/api/finishings", async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const name = text(req.body.name); const code = text(req.body.code).toUpperCase();
      const categories = [...new Set(req.body.categories || [])].map(text).filter(Boolean);
      if (!name || !code || !categories.length) throw new Error("Nama, kode, dan minimal satu kategori finishing wajib diisi");
      unique(state, "finishings", "code", code); unique(state, "finishings", "name", name);
      const finishing = { id: identifier("fin", code), code, name, categories, price: Math.max(0, Number(req.body.price || 0)), rule: text(req.body.rule) || "free", active: req.body.active !== false };
      state.finishings.push(finishing); return finishing;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.put("/api/finishings/:id", async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const finishing = state.finishings.find((item) => item.id === req.params.id);
      if (!finishing) throw new Error("Finishing tidak ditemukan");
      const name = text(req.body.name); const code = text(req.body.code).toUpperCase();
      const categories = [...new Set(req.body.categories || [])].map(text).filter(Boolean);
      if (!name || !code || !categories.length) throw new Error("Nama, kode, dan minimal satu kategori finishing wajib diisi");
      unique(state, "finishings", "code", code, finishing.id); unique(state, "finishings", "name", name, finishing.id);
      Object.assign(finishing, { code, name, categories, price: Math.max(0, Number(req.body.price || 0)), rule: text(req.body.rule) || "free", active: req.body.active !== false });
      return finishing;
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.post("/api/machines", async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const name = text(req.body.name); const code = text(req.body.code).toUpperCase();
      if (!name || !code) throw new Error("Nama dan kode mesin wajib diisi");
      unique(state, "machines", "name", name);
      const machine = { id: identifier("mach", code), code, name, type: text(req.body.type) || "Produksi", status: text(req.body.status) || "AKTIF", costPerHour: Math.max(0, Number(req.body.costPerHour || 0)), capacity: text(req.body.capacity), active: req.body.active !== false };
      state.machines.push(machine); return machine;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.put("/api/machines/:id", async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const machine = state.machines.find((item) => item.id === req.params.id);
      if (!machine) throw new Error("Mesin tidak ditemukan");
      const name = text(req.body.name); const code = text(req.body.code).toUpperCase();
      if (!name || !code) throw new Error("Nama dan kode mesin wajib diisi");
      unique(state, "machines", "name", name, machine.id);
      Object.assign(machine, { code, name, type: text(req.body.type) || "Produksi", status: text(req.body.status) || "AKTIF", costPerHour: Math.max(0, Number(req.body.costPerHour || 0)), capacity: text(req.body.capacity), active: req.body.active !== false });
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
  const priceBasis = ["unit", "sqm", "linear_m"].includes(body.priceBasis) ? body.priceBasis : "unit";
  const saleUnit = text(body.saleUnit) || "pcs";
  const sourceIds = new Set();
  const materialSources = (body.materialSources || []).filter((source) => Number(source.quantity) > 0).map((source) => {
    const material = state.materials.find((item) => item.id === source.materialId);
    if (!material || material.active === false) throw new Error("Pilih bahan aktif yang valid");
    if (sourceIds.has(material.id)) throw new Error("Bahan yang sama tidak boleh ditambahkan dua kali");
    sourceIds.add(material.id);
    return { materialId: material.id, sku: material.sku, name: material.name, unit: material.unit, quantity: Number(source.quantity), wastePercent: Math.max(0, Number(source.wastePercent || 0)) };
  });
  if (!materialSources.length) throw new Error("Produk wajib memiliki minimal satu sumber bahan");
  const machineIds = [...new Set(body.machineIds || [])].filter((id) => state.machines.some((machine) => machine.id === id && machine.active !== false));
  if (!machineIds.length && !current) throw new Error("Pilih minimal satu mesin");
  const unitLabels = { pcs: "/pcs", lbr: "/lembar", "m²": "/m²", pack: "/pack", rim: "/rim", set: "/set", "m lari": "/m lari" };
  const finishingIds = [...new Set(body.finishingIds || [])].filter((id) => state.finishings.some((item) => item.id === id && item.active !== false && item.categories.includes(text(body.category))));
  const finishing = finishingIds.map((id) => structuredClone(state.finishings.find((item) => item.id === id)));
  const category = text(body.category);
  const product = { id: current?.id || identifier("prd", sku), sku, name, category, baseCost, price, priceBasis, saleUnit, unitName: saleUnit, unitLabel: unitLabels[saleUnit] || `/${saleUnit}`, widths: priceBasis === "unit" ? [] : (body.widths || []).map(Number).filter((value) => value > 0), billingIncrement: ["LF Poster", "LF Sticker"].includes(category) ? 0.1 : Number(current?.billingIncrement || 0.5), areaPerUnit: Number(current?.areaPerUnit || 0), note: text(body.note), featured: Boolean(body.featured), recommendation: text(body.recommendation) || "Produk pilihan", active: body.active !== false, wholesaleEnabled: Boolean(body.wholesaleEnabled), priceTiers: normalizeTiers(body, price), discount: normalizeDiscount(body), materialSources, machineIds, finishingIds, finishing, templateProduct: Boolean(current?.templateProduct), sizeVariants: current?.sizeVariants || [], designTemplates: current?.designTemplates || [], fixedSizeVariants: current?.fixedSizeVariants || [] };
  if (priceBasis !== "unit" && !product.widths.length) throw new Error("Tambahkan minimal satu pilihan lebar bahan");
  if (current) Object.assign(current, product); else state.products.push(product);
  return product;
}

app.post("/api/products", async (req, res, next) => {
  try { const result = await store.mutate((state) => saveProduct(state, req.body)); res.status(201).json(result); } catch (error) { next(error); }
});
app.put("/api/products/:id", async (req, res, next) => {
  try { const result = await store.mutate((state) => { const product = state.products.find((item) => item.id === req.params.id); if (!product) throw new Error("Produk tidak ditemukan"); return saveProduct(state, req.body, product); }); res.json(result); } catch (error) { next(error); }
});

app.post("/api/orders", async (req, res, next) => {
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
        stockCommitted: false,
        items: priced.items,
        total: priced.total,
        createdAt: now(),
        updatedAt: now(),
        timeline: []
      };
      activity(state, order, "Pesanan dibuat di POS");
      state.orders.unshift(order);
      return order;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

app.put("/api/orders/:id", async (req, res, next) => {
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
      activity(state, order, "Draft pesanan diperbarui", "Kasir");
      return order;
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.post("/api/orders/:id/payments", async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const order = state.orders.find((item) => item.id === req.params.id);
      if (!order) throw new Error("Pesanan tidak ditemukan");
      normalizeOrder(order);
      const method = String(req.body.method || "").trim();
      const type = req.body.type === "LUNAS" ? "LUNAS" : "DP";
      const amount = Math.max(0, Number(req.body.amount || 0));
      const outstanding = Math.max(0, order.total - order.paidAmount);
      const poNumber = String(req.body.poNumber || "").trim();
      if (!method) throw new Error("Metode pembayaran wajib dipilih");
      if (type === "LUNAS" && amount < outstanding) throw new Error("Nominal pelunasan kurang dari sisa tagihan");
      if (type === "DP" && amount <= 0 && !poNumber) throw new Error("Masukkan nominal DP atau nomor PO");
      const payment = { id: crypto.randomUUID(), method, type, amount, poNumber, createdAt: now() };
      order.payments.push(payment);
      order.paidAmount += amount;
      order.paymentConfirmed = true;
      order.paymentStatus = order.paidAmount >= order.total ? "LUNAS" : "BELUM_LUNAS";
      if (order.status === STATUS.WAITING_PAYMENT) order.status = STATUS.DESIGN;
      order.updatedAt = now();
      activity(state, order, `${type === "LUNAS" ? "Pelunasan" : "Pembayaran sebagian"} ${method} dicatat`, "Kasir");
      return order;
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.patch("/api/orders/:id/design-pic", async (req, res, next) => {
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

app.patch("/api/orders/:id/status", async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const order = state.orders.find((item) => item.id === req.params.id);
      if (!order) throw new Error("Pesanan tidak ditemukan");
      normalizeOrder(order);
      const target = req.body.status;
      if (target !== allowedNextStatus(order.status)) throw new Error("Perpindahan status tidak valid");
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
      activity(state, order, `Status berubah menjadi ${STATUS_LABEL[target]}`, String(req.body.actor || "Tim Produksi"));
      return order;
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.patch("/api/inventory/:sku", async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const stock = state.inventory.find((item) => item.sku === req.params.sku);
      if (!stock) throw new Error("Item stok tidak ditemukan");
      const change = Number(req.body.change);
      if (!Number.isFinite(change) || change === 0) throw new Error("Jumlah penyesuaian tidak valid");
      stock.quantity = Number(stock.quantity) + change;
      stock.updatedAt = now();
      const movement = { id: crypto.randomUUID(), sku: stock.sku, productName: stock.productName, change, balance: stock.quantity, orderCode: null, reason: String(req.body.reason || "Penyesuaian stok"), createdAt: now() };
      state.stockMovements.unshift(movement);
      return { stock, movement };
    });
    res.json(result);
  } catch (error) { next(error); }
});

app.use(express.static("public"));
app.get("/{*path}", (_req, res) => res.sendFile(new URL("./public/index.html", import.meta.url).pathname));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(400).json({ error: error.message || "Terjadi kesalahan" });
});

await store.init();
app.listen(port, "0.0.0.0", () => console.log(`Manna POS berjalan di port ${port}`));
