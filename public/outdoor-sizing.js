// Nominal width remains the pricing basis; capacity is only used to select the roll.
export const OUTDOOR_CAPACITIES = {
  'fl-280-glossy': {1:110,2:220,3:320},
  'fl-380-matte': {1:110,2:220,3:320},
  'fl-410-glossy': {2:220},
  'fl-440-matte': {3:320},
  'nb-backlite-510': {3:320}
};
export function supportsOutdoorAllowance(product) {
  return !product.templateProduct && product.priceBasis !== 'unit' && (product.category === 'Outdoor' || Boolean(product.outdoorCapacities) || Boolean(OUTDOOR_CAPACITIES[product.id]) || product.id === 'cloth-banner');
}
export function outdoorCapacity(product,width) {
  return Number((product.outdoorCapacities || OUTDOOR_CAPACITIES[product.id] || {})[width] ?? Number(width)*100);
}
export function suggestedOutdoorWidth(product,imageWidthCm,allowanceCm=0) {
  const widths=[...(product.widths || [])].sort((a,b)=>outdoorCapacity(product,a)-outdoorCapacity(product,b));
  const required=Number(imageWidthCm)+2*Number(allowanceCm);
  return widths.find(width=>outdoorCapacity(product,width)>=required-1e-9) ?? widths.at(-1);
}
export function imageGeometry(product,input) {
  const imageWidthCm=Number(input.imageWidthCm),imageLengthCm=Number(input.imageLengthCm);
  const allowanceCm=supportsOutdoorAllowance(product) ? Number(input.allowanceCm ?? 0) : 0;
  if (!Number.isFinite(imageWidthCm)||imageWidthCm<=0||!Number.isFinite(imageLengthCm)||imageLengthCm<=0) throw new Error('Ukuran gambar tidak valid');
  if (!Number.isFinite(allowanceCm)||allowanceCm<0) throw new Error('Lebihan tidak valid');
  const finalImageWidthCm=Number((imageWidthCm+2*allowanceCm).toFixed(4));
  const finalImageLengthCm=Number((imageLengthCm+2*allowanceCm).toFixed(4));
  const billingLength=(imageLengthCm+(allowanceCm>5?2*allowanceCm:0))/100;
  return {imageWidthCm,imageLengthCm,allowanceCm,finalImageWidthCm,finalImageLengthCm,billingLength};
}
