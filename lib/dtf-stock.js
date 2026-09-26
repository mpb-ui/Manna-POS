import { DTF_SHIRT_MATERIALS, DTF_SHIRT_PRODUCT } from "./dtf-catalog.js";

const shirtIds = new Set(DTF_SHIRT_MATERIALS.map((item) => item.id));

export function shirtRequirements(order) {
  const requirements = new Map();
  for (const line of order.items || []) {
    if (line.productId !== DTF_SHIRT_PRODUCT.id) continue;
    for (const source of line.materials || []) {
      if (shirtIds.has(source.materialId)) {
        requirements.set(source.materialId, (requirements.get(source.materialId) || 0) + Number(source.units || 0));
      }
    }
  }
  return requirements;
}

export function shirtReservations(state, excludeOrderId = null) {
  const reserved = new Map();
  for (const order of state.orders || []) {
    if (order.id === excludeOrderId || !order.paymentConfirmed || order.stockCommitted) continue;
    for (const [materialId, quantity] of shirtRequirements(order)) {
      reserved.set(materialId, (reserved.get(materialId) || 0) + quantity);
    }
  }
  return reserved;
}

export function shirtAvailability(state) {
  const reserved = shirtReservations(state);
  return DTF_SHIRT_MATERIALS.map((material) => {
    const row = state.inventory.find((item) => item.materialId === material.id);
    return { materialId: material.id, color: material.name.split(" ")[2], size: material.name.split(" ")[3], available: Math.max(0, Number(row?.quantity || 0) - Number(reserved.get(material.id) || 0)) };
  });
}

export function ensureShirtStock(state, order, { physical = false } = {}) {
  const reserved = physical ? new Map() : shirtReservations(state, order.id);
  for (const [materialId, quantity] of shirtRequirements(order)) {
    const material = DTF_SHIRT_MATERIALS.find((item) => item.id === materialId);
    const row = state.inventory.find((item) => item.materialId === materialId);
    if (!row) throw new Error(`Stok ${material.name} belum tersedia`);
    const available = Number(row.quantity || 0) - Number(reserved.get(materialId) || 0);
    if (quantity > available) throw new Error(`Stok ${material.name} tidak cukup (tersedia ${Math.max(0, available)} pcs, dibutuhkan ${quantity} pcs)`);
  }
}
