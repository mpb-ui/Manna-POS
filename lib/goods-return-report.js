export function goodsReturnReport(state, range, { includeOrder, includeItem, showCost }) {
  const orders = new Map(state.orders.map(order => [order.id, order])), rows = [];
  for (const record of state.goodsReturns || []) {
    const at = new Date(record.createdAt), order = orders.get(record.orderId);
    if (at < range.from || at > range.to || !order || !includeOrder(order)) continue;
    for (const line of record.lines) {
      const item = order.items.find(item => item.itemId === line.itemId);
      if (!item || !includeItem(order,item)) continue;
      rows.push({ id:line.id, returnId:record.id, code:record.code, invoice:record.invoice, orderId:order.id, customer:record.customerName, date:record.createdAt, actor:record.actor, product:line.productName, sku:line.sku, quantity:line.quantity, unitName:line.unitName, stockChange:-line.quantity, note:record.note, sourceCode:line.sourceCode, ...(showCost ? { cost:line.cost } : {}) });
    }
  }
  rows.sort((a,b)=>b.date.localeCompare(a.date));
  return { rows, transactions:new Set(rows.map(row=>row.returnId)).size, quantity:rows.reduce((sum,row)=>sum+row.quantity,0), ...(showCost ? { cost:rows.reduce((sum,row)=>sum+row.cost,0) } : {}) };
}
