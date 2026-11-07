import { finishedItem, nextItemStatus, refreshOrderWorkflow, refreshOrderHold } from "../public/item-workflow.js";
import { PRODUCTION_STATUSES, canMoveProduction, driveLink, productionDetail } from "../public/project-item.js";
import { STATUS_LABEL } from "./domain.js";
import { allowedStatusForRole, canRequestStatus, hasPermission, effectivePermissions, orderVisibleToUser } from "./access.js";
import { cancelled } from "../public/order-rules.js";
import { ensureShirtStock } from "./dtf-stock.js";
import { commitPhysicalStock } from "./physical-stock.js";

export function commitOrderStock(state, order, now, { itemIds = null, actor = "Sistem" } = {}) {
  const selected = order.items.filter(item => !item.stockCommitted && item.stockTiming !== "SALE" && (!itemIds || itemIds.includes(item.itemId)) && ["CETAK", "FINISHING", "SELESAI", "DIAMBIL"].includes(item.status));
  if (!selected.length) return;
  ensureShirtStock(state, { ...order, items: selected }, { physical: true });
  commitPhysicalStock(state, order, { itemIds: selected.map(item => item.itemId), actor, timestamp: now() });
}

export function registerItemWorkflowRoutes(app, { store, requirePermission, normalizeOrder, sanitizeOrder, activity, audit, now }) {
  const findJob = (state, req) => {
    const order = state.orders.find(order => order.id === req.params.id);
    if (!order || !orderVisibleToUser(order, req.user)) throw new Error("Pesanan tidak ditemukan");
    normalizeOrder(order);
    const item = order.items.find(item => item.itemId === req.params.itemId);
    if (!item) throw new Error("Produk pesanan tidak ditemukan");
    return { order, item };
  };
  const run = mutate => async (req, res, next) => {
    try { res.json(await store.mutate(state => mutate(state, req))); }
    catch (error) {
      if (error.status || ["ORDER_HELD", "STALE_ITEM_STATUS", "STALE_ITEM_DETAILS", "STALE_ITEM_HOLD"].includes(error.code)) return res.status(error.status || 409).json({ error: error.message, code: error.code });
      next(error);
    }
  };
  const route = "/api/orders/:id/items/:itemId";
  const editor = user => ['projects.assign','projects.status','pos.edit'].some(permission => hasPermission(user,permission));
  const projection = (order,item,user) => ({...productionDetail(order,item),canEdit:editor(user) && !cancelled(order) && PRODUCTION_STATUSES.includes(item.status)});
  const conflict = (message,code) => { const error = new Error(message); error.code = code; throw error; };
  const productionJob = (state,req) => {
    if (!hasPermission(req.user,'projects.orders')) throw Object.assign(new Error('Anda tidak memiliki akses Project Management'),{status:403});
    const job = findJob(state,req);
    if (cancelled(job.order) || !PRODUCTION_STATUSES.includes(job.item.status) || job.item.stockTiming === 'SALE') throw new Error('Item tidak lagi berada di Project Management');
    return job;
  };
  app.get(`${route}/production-details`, async (req,res,next) => {
    try { const {order,item}=productionJob(await store.read(),req); res.json(projection(order,item,req.user)); }
    catch(error) { if(error.status)res.status(error.status).json({error:error.message});else next(error); }
  });
  app.patch(`${route}/production-details`, run((state,req) => {
    const {order,item}=productionJob(state,req);
    if (!editor(req.user)) throw Object.assign(new Error('Anda tidak memiliki akses mengubah detail produksi'),{status:403});
    if (!Number.isSafeInteger(req.body.expectedRevision) || req.body.expectedRevision !== (item.productionRevision || 0)) conflict('Catatan atau link telah diubah pengguna lain. Buka ulang detail sebelum menyimpan.','STALE_ITEM_DETAILS');
    if (typeof req.body.productionNote !== 'string' || req.body.productionNote.length > 2000) throw new Error('Catatan maksimal 2.000 karakter');
    const productionNote=req.body.productionNote.trim(), driveUrl=driveLink(req.body.driveUrl);
    if (productionNote === (item.productionNote || '') && driveUrl === (item.driveUrl || '')) return projection(order,item,req.user);
    item.productionNote=productionNote; item.driveUrl=driveUrl; item.productionRevision=(item.productionRevision || 0)+1;
    item.productionUpdatedAt=now(); item.productionUpdatedBy=req.user.name; item.updatedAt=now(); order.updatedAt=now();
    activity(state,order,`Catatan dan link produksi ${item.productName} (item ${order.items.indexOf(item)+1}) diperbarui`,req.user.name,{itemId:item.itemId,productName:item.productName});
    audit(state,req.user,'ORDER_ITEM_PRODUCTION_DETAILS',`Memperbarui detail produksi ${order.code}`,{orderId:order.id,itemId:item.itemId,revision:item.productionRevision});
    return projection(order,item,req.user);
  }));
  app.patch(`${route}/hold`, run((state,req) => {
    const {order,item}=productionJob(state,req);
    if (!editor(req.user)) throw Object.assign(new Error('Anda tidak memiliki akses mengubah penanda tertahan'),{status:403});
    if (item.status === 'SELESAI') throw new Error('Item selesai tidak dapat ditandai tertahan');
    if (Object.hasOwn(req.body,'expectedHoldUpdatedAt') && req.body.expectedHoldUpdatedAt !== (item.hold?.updatedAt || null)) conflict('Penanda tertahan telah berubah. Buka ulang detail.','STALE_ITEM_HOLD');
    const release=req.body.release===true, reason=String(req.body.reason || '').trim(), note=String(req.body.note || '').trim(), previous=item.hold;
    if (!release && (!reason || reason.length>160 || note.length>1000)) throw new Error('Pilih alasan tertahan; catatan alasan maksimal 1.000 karakter');
    if (release && !previous) return projection(order,item,req.user);
    item.hold=release?null:{reason,note,since:previous?.since || now(),updatedAt:now(),actor:req.user.name,userId:req.user.id};
    item.updatedAt=now(); order.updatedAt=now(); refreshOrderHold(order);
    activity(state,order,`${item.productName} (item ${order.items.indexOf(item)+1}): ${release?'Penanda tertahan dilepas':`Tertahan · ${reason}`}`,req.user.name,{itemId:item.itemId,productName:item.productName});
    audit(state,req.user,'ORDER_ITEM_HOLD',`Memperbarui penanda tertahan ${order.code}`,{orderId:order.id,itemId:item.itemId,release,reason});
    return projection(order,item,req.user);
  }));
  app.patch(`${route}/project-status`, run((state,req) => {
    const {order,item}=productionJob(state,req), target=req.body.status;
    if (!canMoveProduction({...req.user,permissions:effectivePermissions(req.user)},item.status,target)) throw Object.assign(new Error('Anda tidak memiliki akses memindahkan status ini'),{status:403});
    if (req.body.expectedStatus !== item.status) conflict('Status produk telah berubah. Muat ulang daftar.','STALE_ITEM_STATUS');
    if (Object.hasOwn(req.body,'expectedHoldUpdatedAt') && req.body.expectedHoldUpdatedAt !== (item.hold?.updatedAt || null)) conflict('Penanda tertahan telah berubah. Muat ulang daftar.','STALE_ITEM_HOLD');
    if (!order.paymentConfirmed) throw new Error('Pesanan belum dikonfirmasi');
    if (target === item.status) return projection(order,item,req.user);
    if (item.status === 'DESAIN' && !item.designPic) throw new Error('Nama PIC Operator Design wajib diisi');
    const previous=item.status, previousHold=item.hold;
    item.status=target; item.statusEnteredAt=now(); item.updatedAt=now(); item.completedAt=target==='SELESAI'?now():null; item.hold=null;
    refreshOrderHold(order); refreshOrderWorkflow(order,now());
    commitOrderStock(state,order,now,{itemIds:[item.itemId],actor:req.user.name});
    activity(state,order,`${item.productName} (item ${order.items.indexOf(item)+1}): ${STATUS_LABEL[previous]} → ${STATUS_LABEL[target]}${previousHold?' · Penanda tertahan dilepas':''}`,req.user.name,{itemId:item.itemId,productName:item.productName});
    audit(state,req.user,'ORDER_ITEM_STATUS',`Mengubah status produk ${order.code}`,{orderId:order.id,itemId:item.itemId,previousStatus:previous,status:target,releasedHold:Boolean(previousHold)});
    return projection(order,item,req.user);
  }));
  app.patch(`${route}/design-pic`, requirePermission("projects.assign"), run((state, req) => {
    const { order, item } = findJob(state, req);
    if (!["DESAIN", "CETAK", "FINISHING", "SELESAI"].includes(item.status)) throw new Error("PIC hanya dapat ditetapkan pada produk aktif");
    const pic = state.pics.find(pic => pic.name === String(req.body.designPic || "").trim() && pic.active !== false && !pic.deletedAt);
    if (!pic) throw new Error("PIC tidak tersedia");
    if (item.designPicId === pic.id && item.designPic === pic.name) return sanitizeOrder(order, req.user);
    const previous = item.designPic || null;
    item.designPic = pic.name; item.designPicId = pic.id; item.designPicColor = pic.color; item.updatedAt = now();
    refreshOrderWorkflow(order, now());
    activity(state, order, `PIC ${item.productName} (item ${order.items.indexOf(item) + 1}): ${previous || "Belum ditetapkan"} → ${pic.name}`, req.user.name, { itemId: item.itemId, productName: item.productName });
    audit(state, req.user, "ORDER_ITEM_PIC", `Mengubah PIC produk ${order.code}`, { orderId: order.id, itemId: item.itemId, previous, designPicId: pic.id });
    return sanitizeOrder(order, req.user);
  }));
  app.patch(`${route}/deadline`, (req, res, next) => {
    if (!["OWNER", "CASHIER", "MANAGER"].includes(req.user.role) || req.user.role === "MANAGER" && !hasPermission(req.user, "pos.edit")) return res.status(403).json({ error: "Deadline hanya dapat diubah Owner, Kasir, atau Manager dengan akses edit pesanan" });
    next();
  }, run((state, req) => {
    const { order, item } = findJob(state, req);
    const value = req.body.deadline;
    if (value !== null && value !== "" && (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) || !Number.isFinite(Date.parse(value)))) throw new Error("Tanggal dan jam deadline tidak valid");
    const deadline = value ? new Date(value).toISOString() : null;
    if (item.deadline === deadline) return sanitizeOrder(order, req.user);
    const previous = item.deadline;
    const format = value => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar" }).format(new Date(value)) + " WITA" : "Tidak ditentukan";
    item.deadline = deadline; item.updatedAt = now(); refreshOrderWorkflow(order, now());
    activity(state, order, `Deadline ${item.productName} (item ${order.items.indexOf(item) + 1}): ${format(previous)} → ${format(deadline)}`, req.user.name, { itemId: item.itemId, productName: item.productName });
    audit(state, req.user, "ORDER_ITEM_DEADLINE", `Mengubah deadline produk ${order.code}`, { orderId: order.id, itemId: item.itemId, previousDeadline: previous, deadline });
    return sanitizeOrder(order, req.user);
  }));
  app.patch(`${route}/status`, (req, res, next) => {
    if (!canRequestStatus(req.user, req.body.status)) return res.status(403).json({ error: "Anda tidak memiliki akses mengubah status ini" });
    next();
  }, run((state, req) => {
    const { order, item } = findJob(state, req), target = req.body.status;
    if (cancelled(order)) throw new Error("Pesanan dibatalkan tidak dapat diproses");
    if (item.hold) { const error = new Error("Produk masih tertahan. Lepaskan penanda setelah kendala selesai."); error.code = "ORDER_HELD"; throw error; }
    if (req.body.expectedStatus && req.body.expectedStatus !== item.status) { const error = new Error("Status produk telah berubah. Muat ulang pesanan."); error.code = "STALE_ITEM_STATUS"; throw error; }
    if (!order.paymentConfirmed || !["DESAIN", "CETAK", "FINISHING"].includes(item.status) || target !== nextItemStatus(item)) throw new Error("Perpindahan status produk tidak valid");
    if (!allowedStatusForRole(req.user.role, item.status, target)) throw new Error("Role Anda tidak dapat memindahkan status ini");
    if (item.status === "DESAIN" && !item.designPic) throw new Error("Nama PIC Operator Design wajib diisi");
    const previous = item.status;
    item.status = target; item.statusEnteredAt = now(); item.updatedAt = now();
    if (target === 'SELESAI') item.completedAt = now();
    refreshOrderWorkflow(order, now()); commitOrderStock(state, order, now, { itemIds: [item.itemId], actor: req.user.name });
    activity(state, order, `${item.productName} (item ${order.items.indexOf(item) + 1}): ${STATUS_LABEL[previous]} → ${STATUS_LABEL[target]}`, req.user.name, { itemId: item.itemId, productName: item.productName });
    audit(state, req.user, "ORDER_ITEM_STATUS", `Mengubah status produk ${order.code}`, { orderId: order.id, itemId: item.itemId, previousStatus: previous, status: target });
    return sanitizeOrder(order, req.user);
  }));
}
