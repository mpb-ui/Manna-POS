// Rates are stored as basis points; amounts are whole rupiah.
export function taxRateBps(value) {
  const match = /^(\d{1,2})(?:[,.](\d{1,2}))?$/.exec(String(value ?? '').trim());
  const rate = match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')) : 0;
  if (!rate || rate >= 10000) throw new Error('Isi tarif pajak lebih dari 0% dan di bawah 100%, maksimal dua angka desimal.');
  return rate;
}

export function grossUpQuote(net, rateBps) {
  if (!Number.isSafeInteger(net) || net < 0 || !Number.isInteger(rateBps) || rateBps < 0 || rateBps >= 10000) throw new Error('Tarif pajak atau nominal pesanan tidak valid.');
  const denominator = BigInt(10000 - rateBps);
  const total = Number((BigInt(net) * 10000n + denominator / 2n) / denominator);
  if (!Number.isSafeInteger(total)) throw new Error('Total tagihan terlalu besar.');
  return { total, adjustment: total - net };
}

export const taxAdjustment = order => Number(order.taxGrossUp?.adjustment || 0);
export const taxWithheld = order => (order.payments || []).reduce((sum, p) => sum + (p.type === 'REVERSAL' || p.type === 'PO' ? 0 : Number(p.taxWithheld || 0)), 0);
