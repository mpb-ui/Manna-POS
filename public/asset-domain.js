export const ASSET_CATEGORIES = ['Mesin Produksi', 'Komputer', 'UPS', 'AC', 'Furnitur', 'Peralatan Lainnya'];
export const ASSET_STATUS = { PLANNED: 'Belum Digunakan', ACTIVE: 'Aktif', FULLY_DEPRECIATED: 'Habis Disusutkan', SOLD: 'Dijual', SCRAPPED: 'Dilepas / Rusak', CANCELLED: 'Dibatalkan' };
export function assetToday() { return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Makassar'}).format(new Date()); }
export function assetPeriod(value) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(value)) || Number(value.slice(0,4)) < 1900 || Number(value.slice(0,4)) > 2200) throw new Error('Bulan aset tidak valid');
  return value;
}
export function periodIndex(value) { assetPeriod(value); return Number(value.slice(0,4))*12 + Number(value.slice(5,7))-1; }
export function indexPeriod(value) { return `${Math.floor(value/12)}-${String(value%12+1).padStart(2,'0')}`; }
export function addAssetMonths(value, months) { return indexPeriod(periodIndex(value)+months); }
// A full monthly charge starts in the ready-for-use month. No charge in the disposal month.
// Rounding cumulative balances rather than each charge keeps the final residual exact.
export function calculateAsset(asset, period) {
  const target=periodIndex(period), start=periodIndex(asset.readyDate.slice(0,7));
  const disposal=asset.disposal ? periodIndex(asset.disposal.date.slice(0,7)) : Infinity;
  const versions=[...(asset.adjustments || [])].sort((a,b)=>a.effectivePeriod.localeCompare(b.effectivePeriod));
  let balance=Number(asset.acquisitionCost), cost=balance, accumulated=0, charge=0, addition=0;
  let base=balance, residual=Number(asset.residualValue), months=Number(asset.usefulLifeMonths), segmentStart=start;
  if (asset.cancelled || target<start) return {period,status:asset.cancelled?'CANCELLED':'PLANNED',depreciation:0,accumulatedDepreciation:0,bookValue:0,carryingCost:0,capitalAddition:0,disposalBookValue:0,disposalGainLoss:0};
  // Bound loops for very old assets and report periods to 301 years via validated dates.
  for(let index=start;index<=Math.min(target,disposal-1);index++) {
    const adjustment=versions.find(row=>periodIndex(row.effectivePeriod)===index);
    if(adjustment) {
      addition=Number(adjustment.capitalAddition || 0); cost+=addition; balance+=addition;
      base=balance; residual=Number(adjustment.residualValue); months=Number(adjustment.remainingMonths); segmentStart=index;
    } else addition=0;
    const elapsed=Math.min(months,index-segmentStart+1);
    const closing=Math.max(residual,Math.round(base-(base-residual)*elapsed/months));
    const expense=Math.max(0,balance-closing); accumulated+=expense; balance=closing;
    if(index===target) charge=expense;
    if(index!==target) addition=0;
  }
  const disposed=disposal<=target;
  return {period,status:disposed?asset.disposal.type:balance<=residual?'FULLY_DEPRECIATED':'ACTIVE',depreciation:disposed?0:charge,accumulatedDepreciation:accumulated,bookValue:disposed?0:balance,carryingCost:disposed?0:cost,capitalAddition:addition,disposalBookValue:disposed?balance:0,disposalGainLoss:disposal===target?Number(asset.disposal.proceeds || 0)-balance:0};
}
export function assetSchedule(asset, from, to) {
  const start=periodIndex(from), end=periodIndex(to);
  if(end<start || end-start>119) throw new Error('Rentang jadwal maksimal 120 bulan');
  return Array.from({length:end-start+1},(_,index)=>calculateAsset(asset,indexPeriod(start+index)));
}
