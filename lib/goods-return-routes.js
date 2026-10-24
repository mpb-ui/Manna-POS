import { exchangeDefectiveGoods, goodsReturnOptions, publicGoodsReturn } from './goods-returns.js';
import { hasPermission } from './access.js';
export function registerGoodsReturnRoutes(app, { store, requirePermission, normalizeOrder, activity, audit }) {
  app.get('/api/orders/:id/returns', requirePermission('orders.view'), async (req,res,next) => {
    try {
      const state = await store.read(), order = state.orders.find(order => order.id === req.params.id);
      if (!order) return res.status(404).json({ error:'Pesanan tidak ditemukan' });
      normalizeOrder(order);
      const records = (state.goodsReturns || []).filter(record => record.orderId === order.id).toReversed();
      const pageSize = 25, pages = Math.max(1,Math.ceil(records.length/pageSize)), page = Math.min(pages,Math.max(1,parseInt(req.query.page,10)||1));
      res.json({ options: hasPermission(req.user,'orders.return') ? goodsReturnOptions(state,order) : [], records: records.slice((page-1)*pageSize,page*pageSize).map(record => publicGoodsReturn(record,hasPermission(req.user,'reports.cost'))), page,pages,total:records.length });
    } catch(error) { next(error); }
  });
  app.post('/api/orders/:id/returns', requirePermission('orders.view'), requirePermission('orders.return'), async (req,res,next) => {
    try {
      const record = await store.mutate(state => {
        const order = state.orders.find(order => order.id === req.params.id);
        if (!order) throw Object.assign(new Error('Pesanan tidak ditemukan'),{status:404});
        normalizeOrder(order);
        const result = exchangeDefectiveGoods(state,order,req.body,req.user);
        if (!result.replayed) {
          activity(state,order,`${result.record.code}: retur defect ${result.record.lines.map(line => `${line.quantity} ${line.unitName} ${line.productName}`).join(', ')}; barang pengganti diserahkan tanpa pembayaran tambahan`,req.user.name);
          audit(state,req.user,'GOODS_RETURN',`Penukaran defect ${order.code}`,{orderId:order.id,goodsReturnId:result.record.id,lines:result.record.lines.map(line=>({itemId:line.itemId,quantity:line.quantity}))});
        }
        return publicGoodsReturn(result.record,hasPermission(req.user,'reports.cost'));
      });
      res.json(record);
    } catch(error) { next(error); }
  });
}
