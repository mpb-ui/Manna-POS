import { suggestedOutdoorWidth, supportsOutdoorAllowance } from "../public/outdoor-sizing.js";
import { calculateOrder } from "./domain.js";
import { hasPermission, orderVisibleToUser } from "./access.js";
import { cancelled, unconfirmedDraft, needsFile, needsProduction, completeness, itemChecklist, witaDay } from "../public/order-rules.js";

export function workflowSnapshot(items, products) {
  return items.map(item => {
    const product = products.find(p => p.id === item.productId) || {};
    return { ...item, category: product.category || item.category || "", needsProduction: needsProduction(item, product), needsFile: needsFile(item, product), isBusinessCard: product.a3ReadyType === "card" || /kartu nama|business.card/i.test(product.name || "") };
  });
}
export function checklistForOrder(order, products) {
  return (order.items || []).map((item, index) => ({
    index, productName: item.productName, specification: item.displaySize || "",
    steps: itemChecklist(item, products.find(p => p.id === item.productId)).map(step => {
      const record = order.productionChecks?.[index]?.[step.key];
      return { ...step, done: Boolean(record?.done), actor: record?.actor || "", checkedAt: record?.checkedAt || null };
    })
  })).filter(item => item.steps.length);
}
export function pendingChecks(order, products, phase = order.status) {
  return checklistForOrder(order, products).flatMap(item => item.steps.filter(s => s.phase === phase && !s.done).map(s => ({ ...s, productName: item.productName })));
}

function inventoryFor(state, source) {
  return state.inventory.find(row => (source.materialId && row.materialId === source.materialId) || (source.sku && row.sku === source.sku));
}
export function materialNeeds(state, order) {
  const requirements = new Map();
  for (const item of order.items || []) {
    const sources = item.materials?.length ? item.materials : item.stockSku ? [{ sku: item.stockSku, name: item.productName, units: item.stockConsumption }] : [];
    for (const source of sources) {
      const amount = Number(source.units || 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const inventory = inventoryFor(state, source);
      const key = inventory ? `sku:${inventory.sku}` : `missing:${source.materialId || source.sku}`;
      const previous = requirements.get(key);
      requirements.set(key, { key, materialId: inventory?.materialId || source.materialId || "", sku: inventory?.sku || source.sku || "", name: inventory?.productName || source.name || item.productName, unit: inventory?.unit || source.unit || "unit", required: (previous?.required || 0) + amount, physical: inventory ? Number(inventory.quantity || 0) : null });
    }
  }
  return requirements;
}
export function stockReadiness(state, order, { excludeOrderId = order.id } = {}) {
  if (order.stockCommitted || ["SELESAI", "DIAMBIL"].includes(order.status)) return { committed: true, rows: [], shortages: [] };
  const reserved = new Map();
  for (const other of state.orders || []) {
    if (other.id === excludeOrderId || other.stockCommitted || cancelled(other) || unconfirmedDraft(other) || !other.paymentConfirmed || !["DESAIN", "CETAK", "FINISHING"].includes(other.status)) continue;
    for (const [key, requirement] of materialNeeds(state, other)) reserved.set(key, (reserved.get(key) || 0) + requirement.required);
  }
  const round = n => Number(n.toFixed(4));
  const rows = [...materialNeeds(state, order).values()].map(row => {
    const allocated = reserved.get(row.key) || 0;
    const available = row.physical == null ? null : Math.max(0, row.physical - allocated);
    return { ...row, required: round(row.required), reserved: round(allocated), available: available == null ? null : round(available), shortage: available == null ? null : round(Math.max(0, row.required - available)), untracked: row.physical == null };
  });
  return { committed: false, rows, shortages: rows.filter(r => r.untracked || r.shortage > .0001) };
}
export function assistanceForOrder(state, order) {
  return { orderId: order.id, hold: order.hold || null, fileReadiness: order.fileReadiness || "UNCONFIRMED", issues: completeness(order, state.products), checklist: checklistForOrder(order, state.products), pending: pendingChecks(order, state.products), stock: stockReadiness(state, order), timeline: (order.timeline || []).slice(0,100) };
}

const profileForRole = { OWNER: "all", ADMIN: "all", MANAGER: "all", CASHIER: "cashier", DESIGN: "design", PRINT: "print", WAREHOUSE: "none" };
export function briefingForUser(state, user, at = new Date()) {
  const date = witaDay(at), profile = user.briefingProfile && user.briefingProfile !== "auto" ? user.briefingProfile : profileForRole[user.role] || "none";
  const money = hasPermission(user, "projects.money");
  const orders = state.orders.filter(order => {
    if (cancelled(order) || unconfirmedDraft(order) || !orderVisibleToUser(order, user)) return false;
    const outstanding = Number(order.total || 0) - Number(order.paidAmount || 0) > 0;
    if (profile === "cashier") return outstanding || ["CETAK", "FINISHING"].includes(order.status);
    if (profile === "print") return order.status === "CETAK" || (order.status === "DESAIN" && order.fileReadiness === "READY");
    if (profile === "finishing") return order.status === "FINISHING";
    if (profile === "design") return order.status === "DESAIN";
    if (profile === "all") return outstanding || !["SELESAI", "DIAMBIL"].includes(order.status);
    return false;
  }).map(order => {
    const deadlineTime = order.deadline ? Date.parse(order.deadline) : NaN;
    const priority = Number.isFinite(deadlineTime) && deadlineTime < +at ? 0 : Number.isFinite(deadlineTime) && witaDay(deadlineTime) === date ? 1 : 2;
    const waitingSince = order.hold?.since || order.statusEnteredAt || order.createdAt;
    return { id: order.id, code: order.code, customerName: order.customerName, summary: (order.items || []).map(item => `${item.productName} · ${item.displaySize || `${item.quantity} unit`}`).join("; "), deadline: order.deadline || null, status: order.status, pic: order.designPic || "Belum ada PIC", priority, waitingSince, hold: order.hold || null, ...(money ? { outstanding: Math.max(0, Number(order.total || 0) - Number(order.paidAmount || 0)) } : {}) };
  }).sort((a, b) => a.priority - b.priority || (Date.parse(a.waitingSince) || 0) - (Date.parse(b.waitingSince) || 0));
  return { date, profile, userName: user.name, canSeeMoney: money, count: orders.length, overdueCount: orders.filter(o => o.priority === 0).length, todayCount: orders.filter(o => o.priority === 1).length, draftCount: hasPermission(user, "projects.waiting") ? state.orders.filter(o => !cancelled(o) && unconfirmedDraft(o)).length : 0, read: user.briefingState?.date === date && Boolean(user.briefingState?.readAt), orders };
}
export function claimBriefing(state, userId, at = new Date()) {
  const user = state.users.find(u => u.id === userId);
  const briefing = briefingForUser(state, user, at);
  const alreadyShown = user.briefingState?.date === briefing.date && Boolean(user.briefingState?.shownAt || user.briefingState?.readAt);
  if (!alreadyShown && briefing.count) user.briefingState = { date: briefing.date, shownAt: at.toISOString(), readAt: null };
  return { ...briefing, show: !alreadyShown && briefing.count > 0 };
}

export function phoneKey(value) {
  const raw = String(value || "").trim();
  if (/[^\d\s+().-]/.test(raw)) return `text:${raw.toLocaleLowerCase("id")}`;
  let result = raw.replace(/\D/g, "");
  if (!result && raw) return `text:${raw.toLocaleLowerCase("id")}`;
  if (result.startsWith("62") && result.length >= 10) result = "0" + result.slice(2);
  return result;
}
export function lastCustomerOrder(state, user, name, phone) {
  const key = String(name || "").trim().toLocaleLowerCase("id");
  if (!key) return { order: null };
  let orders = state.orders.filter(o => !cancelled(o) && !unconfirmedDraft(o) && orderVisibleToUser(o, user) && o.customerName.trim().toLocaleLowerCase("id") === key);
  if (phoneKey(phone)) orders = orders.filter(o => phoneKey(o.phone) === phoneKey(phone));
  else if (new Set(orders.map(o => phoneKey(o.phone))).size > 1) return { order: null, ambiguous: true };
  orders.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const o = orders[0];
  return { order: o ? { id: o.id, code: o.code, customerName: o.customerName, phone: o.phone || "", createdAt: o.createdAt, summary: o.items.map(i => i.productName).join(", "), ...(hasPermission(user, "projects.money") ? { total: o.total } : {}) } : null };
}
export function repeatQuote(state, order, user) {
  const products = state.products.filter(p => p.active !== false && !p.deletedAt), issues = [], inputs = [];
  for (const item of order.items) {
    const product = products.find(p => p.id === item.productId);
    if (!product) { issues.push(`${item.productName}: produk tidak lagi tersedia.`); continue; }
    const input = { productId: item.productId, width: supportsOutdoorAllowance(product) && !product.widths.includes(item.width) ? suggestedOutdoorWidth(product,item.imageWidthCm || Number(item.width)*100,item.allowanceCm || 0) : item.width, length: item.actualLength, allowanceCm: item.allowanceCm || 0, imageWidthCm: item.imageWidthCm ?? null, imageLengthCm: item.imageLengthCm ?? null, quantity: item.quantity, sizeVariantId: item.sizeVariantId || "", materialVariantId: item.materialVariantId || "", subVariantId: item.subVariantId || "", dtfPackageId: item.dtfPackageId || "", shirtVariants: structuredClone(item.shirtVariants || []), choices: (item.choices || []).map(c => ({ groupId: c.groupId, optionId: c.optionId })), finishing: (item.finishing || []).map(f => ({ id: f.id, units: f.units, note: f.note || "" })), templateDesign: item.templateDesign || "", fileServiceId: "READY", productionNote: item.productionNote || "" };
    const unavailable = input.finishing.find(f => !product.finishing?.some(current => current.id === f.id));
    if (unavailable) { issues.push(`${item.productName}: salah satu finishing tidak lagi tersedia.`); continue; }
    for (const choice of input.choices) if (!product.choiceGroups?.some(g => g.id === choice.groupId && g.options?.some(o => o.id === choice.optionId))) issues.push(`${item.productName}: pilihan produk berubah.`);
    try { calculateOrder([product], [input]); inputs.push(input); } catch (error) { issues.push(`${item.productName}: ${error.message}`); }
  }
  if (issues.length) return { canRepeat: false, issues, sourceOrderId: order.id, code: order.code };
  const quote = calculateOrder(products, inputs);
  return { canRepeat: true, issues: [], sourceOrderId: order.id, code: order.code, customerName: order.customerName, phone: order.phone || "", inputs, items: workflowSnapshot(quote.items, products), total: quote.total, ...(hasPermission(user, "projects.money") ? { previousTotal: order.total } : {}), stock: stockReadiness(state, { items: quote.items }) };
}
