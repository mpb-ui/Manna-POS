// Shared by the POS preview and authoritative order calculation.
export function normalizeFinishingTiers(value = []) {
  if (!Array.isArray(value) || value.length > 10) throw new Error("Maksimal 10 tingkat grosir finishing");
  const tiers = value.map((tier) => {
    if (!tier || tier.min === "" || tier.min == null || tier.price === "" || tier.price == null) throw new Error("Jumlah minimum dan harga grosir wajib diisi");
    const min = Number(tier.min);
    const max = tier.max === "" || tier.max == null ? null : Number(tier.max);
    const price = Number(tier.price);
    if (!Number.isFinite(min) || min <= 0 || (max !== null && (!Number.isFinite(max) || max < min)) || !Number.isFinite(price) || price < 0) throw new Error("Jumlah atau harga grosir finishing tidak valid");
    return { min, max, price };
  }).sort((a, b) => a.min - b.min);
  tiers.forEach((tier, index) => {
    if (index && (tiers[index - 1].max === null || tier.min <= tiers[index - 1].max)) throw new Error("Rentang tingkat grosir finishing tidak boleh tumpang tindih");
  });
  return tiers;
}

export function finishingPriceForUnits(finishing, units) {
  const tier = (finishing.priceTiers || []).find((item) => units >= item.min && (item.max == null || units <= item.max));
  return tier ? Number(tier.price) : Number(finishing.price || 0);
}
