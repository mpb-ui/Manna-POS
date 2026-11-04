import {outdoorCapacity} from './outdoor-sizing.js';

// Category keys remain stable when the display name is renamed.
export const CATEGORY_WIDTHS=Object.freeze({
  outdoor:Object.freeze([1,1.5,2,3]),
  'lf-poster':Object.freeze([0.9,1.2,1.5]),
  'lf-sticker':Object.freeze([1,1.5])
});
const CAPACITIES={outdoor:{1:110,1.5:150,2:220,3:320},'lf-poster':{0.9:90,1.2:125,1.5:152},'lf-sticker':{1:102,1.5:152}};

export function normalizeProductWidths(widths){
  if(!Array.isArray(widths))throw new Error('Pilihan lebar bahan tidak valid');
  const values=widths.map(Number);
  if(values.some(width=>!Number.isFinite(width)||width<=0))throw new Error('Lebar bahan harus berupa angka positif');
  return [...new Set(values)];
}
export function categoryWidthChoices(category,stored=[]){
  const standard=CATEGORY_WIDTHS[category];
  // Existing nonstandard widths remain editable, without adding them to other products.
  return standard?[...new Set([...standard,...normalizeProductWidths(stored)])].sort((a,b)=>a-b):null;
}

/** Product configuration only: no changes to the POS placement/pricing algorithms. */
export function productWidthSettings(category,submitted,current=null,currentCategory=category){
  const widths=normalizeProductWidths(submitted),sameCategory=current&&currentCategory===category;
  const choices=categoryWidthChoices(category,sameCategory?current.widths||[]:[]);
  if(choices&&widths.some(width=>!choices.includes(width)))throw new Error('Pilih lebar bahan yang tersedia untuk kategori ini');
  if(!choices||sameCategory&&widths.every(width=>(current.widths||[]).includes(width)))return {widths};
  // Keep every existing capacity (including Cloth Banner's 100/150 cm). Only a
  // newly enabled nominal width receives the category's standard physical capacity.
  const rollCapacities={};
  if(sameCategory){
    Object.assign(rollCapacities,current.outdoorCapacities,current.rollCapacities);
    for(const width of current.widths||[])rollCapacities[width]=outdoorCapacity(current,width);
  }
  for(const width of widths)if(!Object.hasOwn(rollCapacities,width))rollCapacities[width]=CAPACITIES[category][width];
  return {widths,rollCapacities};
}
