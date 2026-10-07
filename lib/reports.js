import { ROLE_PRESETS, hasPermission } from "./access.js";
import { STATUS_LABEL } from "./domain.js";
const text = value => String(value || "").trim();
function normalizeOrder(order) { return { ...order, items: order.items || [], payments: order.payments || [], paidAmount: Number(order.paidAmount || 0), paymentStatus: Number(order.paidAmount || 0) >= Number(order.total) && Number(order.total) > 0 ? "LUNAS" : order.paymentConfirmed ? "BELUM_LUNAS" : "BELUM_BAYAR" }; }
function reportRange(query, user) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(new Date());
  const scope = user.reportScope || ROLE_PRESETS[user.role]?.reportScope || "all";
  const fromText = scope === "today" ? today : String(query.from || "");
  const toText = scope === "today" ? today : String(query.to || "");
  const defaultFrom = new Date(); defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);
  const fallbackFrom = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Makassar" }).format(defaultFrom);
  const from = new Date(`${fromText || fallbackFrom}T00:00:00+08:00`);
  const to = new Date(`${toText || today}T23:59:59.999+08:00`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) throw new Error("Rentang tanggal tidak valid");
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

function purchaseOrderNota(order) {
  return {
    code: order.code, customerName: order.customerName, phone: order.phone || "",
    createdAt: order.createdAt, deadline: order.deadline, total: order.total, paidAmount: order.paidAmount || 0,
    items: order.items.map(item => ({
      productName: item.productName, displaySize: item.displaySize, quantity: item.quantity, imageWidthCm: item.imageWidthCm ?? null, imageLengthCm: item.imageLengthCm ?? null,
      baseTotal: item.baseTotal, templateDesign: item.templateDesign, templateDesignTotal: item.templateDesignTotal,
      subtotal: item.subtotal, productionNote: item.productionNote || "",
      fileService: item.fileService ? { id: item.fileService.id, name: item.fileService.name,
        price: item.fileService.price, quantity: item.fileService.quantity, note: item.fileService.note } : null,
      finishing: (item.finishing || []).map(f => ({ name: f.name, units: f.units, note: f.note }))
    }))
  };
}

export function aggregateReport(state, user, query) {
  const range = reportRange(query, user); const money = hasPermission(user, "reports.money"); const cost = hasPermission(user, "reports.cost");
  const paymentMethod = text(query.paymentMethod).toUpperCase();
  if (paymentMethod && !["TUNAI", "QRIS", "TRANSFER"].includes(paymentMethod)) throw new Error("Sumber pembayaran tidak valid");
  const matchesMethod = (order) => !paymentMethod || order.payments.some((payment) => Number(payment.amount) > 0 && String(payment.method).toUpperCase() === paymentMethod);
  const category = text(query.category); const machineId = text(query.machineId); const paymentStatus = text(query.paymentStatus);
  const selectedItems = (order) => order.items.filter((item) => { const product = state.products.find((row) => row.id === item.productId); return (!category || product?.category === category) && (!machineId || (product?.machineIds || []).includes(machineId)); });
  const inUserScope = (order) => range.scope !== "own" || order.createdById === user.id || order.designPic === user.name;
  const orders = state.orders.map(normalizeOrder).filter((order) => {
    const date = new Date(order.createdAt); if (date < range.from || date > range.to) return false;
    if (!inUserScope(order) || !matchesMethod(order)) return false;
    if (paymentStatus && order.paymentStatus !== paymentStatus) return false;
    return selectedItems(order).length > 0;
  });
  const previousMs = range.to.getTime() - range.from.getTime() + 1;
  const previousFrom = new Date(range.from.getTime() - previousMs); const previousTo = new Date(range.from.getTime() - 1);
  const previousOrders = state.orders.map(normalizeOrder).filter((order) => new Date(order.createdAt) >= previousFrom && new Date(order.createdAt) <= previousTo && inUserScope(order) && matchesMethod(order) && (!paymentStatus || order.paymentStatus === paymentStatus) && selectedItems(order).length > 0);
  const selectedSales = (order) => selectedItems(order).reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
  const selectedPaid = (order) => Number(order.total || 0) ? Number(order.paidAmount || 0) * selectedSales(order) / Number(order.total) : 0;
  const sales = orders.reduce((sum, order) => sum + selectedSales(order), 0);
  const scopedOrders = state.orders.map(normalizeOrder).filter(order => inUserScope(order) && matchesMethod(order) && (!paymentStatus || order.paymentStatus === paymentStatus) && selectedItems(order).length > 0);
  const ratio = order => Number(order.total) > 0 ? selectedSales(order) / Number(order.total) : 0;
  const receipts = scopedOrders.flatMap(order => order.payments.filter(payment => {
    const date = new Date(payment.createdAt);
    return Number(payment.amount) > 0 && date >= range.from && date <= range.to && (!paymentMethod || String(payment.method).toUpperCase() === paymentMethod);
  }).map(payment => ({ orderId: order.id, code: order.code, customer: order.customerName, date: payment.createdAt, method: String(payment.method || "Lainnya").toUpperCase(), paid: Number(payment.amount) * ratio(order) }))).sort((a,b) => b.date.localeCompare(a.date));
  const paid = receipts.reduce((sum, payment) => sum + payment.paid, 0);
  const receivables = scopedOrders.filter(order => new Date(order.createdAt) <= range.to).map(order => {
    const historicalPaid = order.payments.filter(payment => new Date(payment.createdAt) <= range.to).reduce((sum,payment) => sum + Number(payment.amount || 0), 0);
    // Legacy totals without dated payment history cannot be assigned to a cash period.
    const legacyPaid = order.payments.length ? historicalPaid : Number(order.paidAmount || 0);
    return { id: order.id, code: order.code, customer: order.customerName, date: order.createdAt, sales: selectedSales(order), paid: legacyPaid * ratio(order), outstanding: Math.max(0, selectedSales(order) - legacyPaid * ratio(order)) };
  }).filter(row => row.outstanding > 0).sort((a,b) => a.date.localeCompare(b.date));
  const outstanding = receivables.reduce((sum,row) => sum + row.outstanding, 0);
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
  const purchaseOrders = money ? orders.flatMap(order => (order.payments || [])
    .filter(payment => payment.type === "PO")
    .map(payment => ({ orderId: order.id, nota: purchaseOrderNota(order), code: order.code,
      customer: order.customerName, poNumber: payment.poNumber, createdAt: payment.createdAt,
      attachment: payment.poAttachment || null }))) : [];
  const topProduct = [...maps.products.values()].sort((a, b) => (money ? b.sales - a.sales : b.quantity - a.quantity))[0];
  const lowStock = state.inventory.filter((item) => Number(item.quantity) <= Number(item.minStock || 0)).length;
  const change = previousSales ? (sales - previousSales) / previousSales * 100 : null;
  const insights = [topProduct ? `${topProduct.label} menjadi produk teratas dengan ${topProduct.quantity.toLocaleString("id-ID")} unit pada periode ini.` : "Belum cukup transaksi untuk membaca tren produk.", lowStock ? `${lowStock} bahan berada pada atau di bawah stok minimum dan perlu diperiksa.` : "Tidak ada bahan yang berada di bawah stok minimum."];
  if (money && change != null) insights.unshift(`Omzet ${change >= 0 ? "naik" : "turun"} ${Math.abs(change).toFixed(1)}% dibanding periode sebelumnya.`);
  const elapsedDays = Math.max(1, Math.ceil((range.to - range.from) / 86400000)); const forecast30 = sales / elapsedDays * 30;
  if (money && sales > 0) insights.push(`Estimasi penjualan 30 hari berikutnya ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(forecast30 * .9)}–${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(forecast30 * 1.1)}, berdasarkan rata-rata periode terpilih.`);
  const inventory = state.inventory.map((item) => { const material = state.materials.find((row) => row.id === item.materialId || row.sku === item.sku); return mask({ id: item.materialId, label: item.productName, sku: item.sku, category: material?.category || item.category || "Lainnya", quantity: Number(item.quantity || 0), minStock: Number(item.minStock || 0), unit: item.unit, low: Number(item.quantity || 0) <= Number(item.minStock || 0), cost: Number(material?.cost || 0), value: Number(item.quantity || 0) * Number(material?.cost || 0) }); });
  const attention = [];
  const activeOrders = scopedOrders.filter(order => !["SELESAI", "DIAMBIL"].includes(order.status));
  const late = activeOrders.filter(order => order.deadline && new Date(order.deadline) < new Date()).length;
  if (late) attention.push({ count: late, label: `${late} pesanan melewati deadline`, tab: "operations" });
  if (money) {
    const unpaidPickup = scopedOrders.filter(order => order.status === "DIAMBIL" && Number(order.paidAmount) < Number(order.total)).length;
    if (unpaidPickup) attention.push({ count: unpaidPickup, label: `${unpaidPickup} pesanan diterima belum lunas`, tab: "receivables" });
  }
  if (lowStock) attention.push({ count: lowStock, label: `${lowStock} bahan mencapai stok minimum`, tab: "inventory" });
  return { receipts: money ? receipts : [], receivables: money ? receivables : [], attention, paymentMethod, range: { from: range.fromText, to: range.toText, locked: range.locked, scope: range.scope }, capabilities: { money, cost, export: hasPermission(user, "reports.export"), print: hasPermission(user, "reports.print") }, summary: mask({ orders: orders.length, items: rows.reduce((sum, row) => sum + row.itemCount, 0), sales, paid, outstanding, cost: hpp, profit: sales - hpp, margin: sales ? (sales - hpp) / sales * 100 : 0, previousSales, change, forecast30 }), days: [...maps.days.values()].sort((a, b) => a.label.localeCompare(b.label)).map(mask), categories: [...maps.categories.values()].sort((a, b) => b.quantity - a.quantity).map(enrich), products: [...maps.products.values()].sort((a, b) => b.quantity - a.quantity).map(enrich), machines: [...maps.machines.values()].sort((a, b) => b.jobs - a.jobs).map(mask), customers: [...maps.customers.values()].sort((a, b) => b.orders - a.orders).map(mask), statuses: [...maps.statuses.values()].sort((a, b) => b.orders - a.orders), inventory, purchaseOrders, paymentSummary: mask({ unpaid: orders.filter((order) => order.paymentStatus === "BELUM_BAYAR").length, partial: orders.filter((order) => order.paymentStatus === "BELUM_LUNAS").length, paidOrders: orders.filter((order) => order.paymentStatus === "LUNAS").length, sales, paid, outstanding }), rows, insights };
}

