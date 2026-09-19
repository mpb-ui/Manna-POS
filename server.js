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

app.get("/api/bootstrap", async (_req, res, next) => {
  try {
    const state = await store.read();
    res.json({ products: state.products, orders: state.orders, inventory: state.inventory, stockMovements: state.stockMovements.slice(0, 50), statusLabels: STATUS_LABEL });
  } catch (error) { next(error); }
});

app.post("/api/orders", async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const priced = calculateOrder(state.products, req.body.items || []);
      if (!priced.items.length) throw new Error("Pesanan belum memiliki produk");
      if (!String(req.body.customerName || "").trim()) throw new Error("Nama pelanggan wajib diisi");
      const paidAmount = Math.max(0, Number(req.body.paidAmount || 0));
      const order = {
        id: crypto.randomUUID(),
        code: orderCode(state.nextOrderNumber++),
        customerName: String(req.body.customerName).trim(),
        phone: String(req.body.phone || "").trim(),
        deadline: req.body.deadline || null,
        fileStatus: req.body.fileStatus || "SIAP_CETAK",
        designPic: String(req.body.designPic || "").trim(),
        notes: String(req.body.notes || "").trim(),
        paymentMethod: req.body.paymentMethod || "TUNAI",
        poNumber: String(req.body.poNumber || "").trim(),
        paidAmount,
        paymentConfirmed: false,
        paymentStatus: paidAmount >= priced.total ? "LUNAS_BELUM_DIKONFIRMASI" : paidAmount > 0 ? "DP" : "BELUM_BAYAR",
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

app.patch("/api/orders/:id/payment", async (req, res, next) => {
  try {
    const result = await store.mutate((state) => {
      const order = state.orders.find((item) => item.id === req.params.id);
      if (!order) throw new Error("Pesanan tidak ditemukan");
      if (order.status !== STATUS.WAITING_PAYMENT) throw new Error("Pembayaran sudah dikonfirmasi");
      const designPic = String(req.body.designPic || order.designPic || "").trim();
      if (!designPic) throw new Error("PIC Operator Design wajib diisi");
      order.designPic = designPic;
      order.paidAmount = Math.max(order.paidAmount, Number(req.body.paidAmount || order.paidAmount));
      order.paymentConfirmed = true;
      order.paymentStatus = order.paidAmount >= order.total ? "LUNAS" : "DP_DIKONFIRMASI";
      order.status = STATUS.DESIGN;
      order.updatedAt = now();
      activity(state, order, `Pembayaran dikonfirmasi; diteruskan ke ${designPic}`, "Kasir");
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
      const target = req.body.status;
      if (target !== allowedNextStatus(order.status)) throw new Error("Perpindahan status tidak valid");
      order.status = target;
      order.updatedAt = now();
      if (target === STATUS.DONE && !order.stockCommitted) {
        for (const line of order.items) {
          const stock = state.inventory.find((item) => item.sku === line.stockSku);
          if (stock) {
            stock.quantity = Number(stock.quantity) - Number(line.stockConsumption);
            stock.updatedAt = now();
            state.stockMovements.unshift({
              id: crypto.randomUUID(), sku: stock.sku, productName: stock.productName,
              change: -line.stockConsumption, balance: stock.quantity, orderCode: order.code,
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
