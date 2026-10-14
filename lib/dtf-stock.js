import { DTF_SHIRT_MATERIALS, DTF_SHIRT_PRODUCT } from "./dtf-catalog.js";

import { cancelled } from "../public/order-rules.js";

export function shirtRequirements(order) {
  const requirements = new Map();
  for (const line of order.items || []) {
    if (line.productId !== DTF_SHIRT_PRODUCT.id || line.stockCommitted) continue;
    for (const source of line.materials || []) {
      if (source.materialId) {
        requirements.set(source.materialId, (requirements.get(source.materialId) || 0) + Number(source.units || 0));
      }
    }
  }
  return requirements;
}

export function shirtReservations(state, excludeOrderId = null) {
  const reserved = new Map();
  for (const order of state.orders || []) {
    if (order.id === excludeOrderId || !order.paymentConfirmed || order.stockCommitted || cancelled(order)) continue;
    for (const [materialId, quantity] of shirtRequirements(order)) {
      reserved.set(materialId, (reserved.get(materialId) || 0) + quantity);
    }
  }
  return reserved;
}

export function shirtAvailability(state) {
  const reserved = shirtReservations(state);
  const product = state.products.find((item) => item.id === DTF_SHIRT_PRODUCT.id);
  return (product?.dtfStockVariants?.length ? product.dtfStockVariants : DTF_SHIRT_PRODUCT.dtfStockVariants).map((variant) => {
    const row = state.inventory.find((item) => item.materialId === variant.materialId);
    return { materialId: variant.materialId, color: variant.color, size: variant.size, available: Math.max(0, Number(row?.quantity || 0) - Number(reserved.get(variant.materialId) || 0)) };
  });
}

export function ensureShirtStock(state, order, { physical = false } = {}) {
  const reserved = physical ? new Map() : shirtReservations(state, order.id);
  for (const [materialId, quantity] of shirtRequirements(order)) {
    const material = state.materials?.find((item) => item.id === materialId) || DTF_SHIRT_MATERIALS.find((item) => item.id === materialId) || { name: materialId };
    const row = state.inventory.find((item) => item.materialId === materialId);
    if (!row) throw new Error(`Stok ${material.name} belum tersedia`);
    const available = Number(row.quantity || 0) - Number(reserved.get(materialId) || 0);
    if (quantity > available) throw new Error(`Stok ${material.name} tidak cukup (tersedia ${Math.max(0, available)} pcs, dibutuhkan ${quantity} pcs)`);
  }
}
