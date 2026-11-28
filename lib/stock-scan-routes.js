import { publicUser } from "./access.js";
import { stockScanAccess } from "../public/stock-scan-rules.js";
import { commitStockScan, correctStockScan, parseScanCommit, parseScanCorrection, scanCorrectionDetails, scanError, scanMaterial, scanMovementView, scanStaff, stockScanCatalog, stockScanStaffCatalog } from "./stock-scan.js";

const authorize = (user, capability) => {
  const access = stockScanAccess(publicUser(user));
  if (!(capability === "catalog" ? access.scan || access.print : access[capability])) {
    throw scanError(403, "SCAN_ACCESS", "Akun ini belum memiliki izin Stock Scan untuk tindakan tersebut.");
  }
};

export function registerStockScan(app, { store, audit }) {
  function route(method, path, capability, handler) {
    app[method](`/api/stock/scan${path}`, async (req, res, next) => {
      try {
        authorize(req.user, capability);
        res.json(await handler(req));
      } catch (error) {
        if (!error.code?.startsWith("SCAN_")) return next(error);
        res.status(error.status).json({ error: error.message, code: error.code, ...error.details });
      }
    });
  }

  function mutate(req, capability, handler) {
    return store.mutate(state => {
      const actor = state.users.find(user => user.id === req.user.id);
      authorize(actor, capability);
      return handler(state, actor, new Date().toISOString(), audit);
    }, { stockScan: true });
  }

  route("get", "/catalog", "catalog", async () => ({ materials: stockScanCatalog(await store.readStockScanCatalog()) }));
  route("get", "/catalog/:id", "scan", async req => ({ material: scanMaterial(await store.readStockScanCatalog(), req.params.id) }));
  route("get", "/staff", "print", async () => ({ staff: stockScanStaffCatalog(await store.readStockScanStaff()) }));
  route("get", "/staff/:barcode", "scan", async req => ({ staff: scanStaff(await store.readStockScanStaff(), req.params.barcode) }));
  route("get", "/history", "scan", async req => {
    const offset = Number(req.query.offset ?? 0);
    const limit = Number(req.query.limit ?? 10);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 25) {
      throw scanError(400, "SCAN_INPUT", "Halaman riwayat tidak valid.");
    }
    const rows = await store.readStockScanHistory(req.user.id, offset, limit + 1);
    return { movements: rows.slice(0, limit).map(scanMovementView), hasMore: rows.length > limit };
  });

  route("post", "/commit", "scan", req => {
    const payload = parseScanCommit(req.body);
    return mutate(req, "scan", (state, ...context) => commitStockScan(state, payload, ...context));
  });
  route("get", "/movements/:id/correction", "correct", async req => scanCorrectionDetails(await store.readStockScanCorrection(req.params.id), req.params.id));
  route("post", "/movements/:id/correction", "correct", req => {
    const payload = parseScanCorrection(req.body, req.params.id);
    return mutate(req, "correct", (state, ...context) => correctStockScan(state, payload, ...context));
  });

  app.get("/stock/scan", (_req, res) => res.sendFile(new URL("../public/stock-scan.html", import.meta.url).pathname));
  app.get("/stock/scan/print", (_req, res) => res.sendFile(new URL("../public/stock-barcode.html", import.meta.url).pathname));
  app.get("/vendor/jsbarcode-code128.min.js", (_req, res) => res.sendFile(new URL("../node_modules/jsbarcode/dist/barcodes/JsBarcode.code128.min.js", import.meta.url).pathname));
}
