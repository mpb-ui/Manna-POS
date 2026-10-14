import { LF_CAPACITIES } from '../public/outdoor-sizing.js';

export const LF_ROLL_VERSION = 1;
export const LF_ROLL_GROUPS = [
  {key:'albatros',name:'Albatros',category:'Roll Indoor',legacy:['mat-albatros'],products:['poster-albatros'],widths:{0.9:90,1.2:125,1.5:152}},
  {key:'luster',name:'Luster',category:'Roll Indoor',legacy:['mat-luster'],products:['poster-luster'],widths:{0.9:90,1.2:125,1.5:152}},
  {key:'canvas',name:'Canvas',category:'Roll Indoor',legacy:['mat-canvas'],products:['poster-canvas'],widths:{1.2:125}},
  {key:'sticker-transparent',name:'LF Sticker Transparant',category:'Sticker',legacy:['mat-sticker-transparent'],products:['lf-sticker-transparent'],widths:{1.5:152}},
  {key:'sticker-glossy',name:'LF Sticker Glossy',category:'Sticker',legacy:['mat-sticker-white-glossy'],products:['lf-sticker-white-glossy'],widths:{1:102,1.5:152}},
  {key:'sticker-matte',name:'LF Sticker Matte',category:'Sticker',legacy:['mat-sticker'],products:['lf-sticker-matte'],widths:{1:102,1.5:152}},
  {key:'sticker-sandblast',name:'LF Sticker Sandblast',category:'Sticker',legacy:['mat-sticker-sandblast'],products:['lf-sticker-sandblast-print','lf-sticker-sandblast-plain'],widths:{1:102,1.5:152}},
  {key:'sticker-oneway',name:'LF Sticker Oneway',category:'Sticker',legacy:['mat-sticker-oneway-outdoor','mat-sticker-oneway-hires'],products:['lf-sticker-oneway-outdoor','lf-sticker-oneway-hires'],widths:{1:102,1.5:152}}
];

// Physical roll identities are separate from legacy calculation sources. Never
// distribute a generic balance or merge Outdoor/HI-RES stock by assumption.
export function initializeLfRolls(state) {
  if (Number(state.lfRollWidthVersion || 0) >= LF_ROLL_VERSION) return;
  state.materials ||= []; state.inventory ||= [];
  const timestamp = new Date().toISOString();
  for (const group of LF_ROLL_GROUPS) {
    const legacy = state.materials.filter(m=>group.legacy.includes(m.id));
    const costs = new Set(legacy.map(m=>Number(m.cost || 0)));
    for (const material of legacy) material.lfLegacyGroup = group.key;
    for (const [nominal,capacity] of Object.entries(group.widths)) {
      const id = `mat-lf-${group.key}-${capacity}`, sku = `BHN-LF-${group.key.toUpperCase()}-${capacity}`;
      let material = state.materials.find(m=>m.id===id);
      if (!material) {
        if (state.materials.some(m=>m.sku===sku) || state.inventory.some(row=>row.sku===sku)) throw new Error(`SKU bahan LF sudah digunakan: ${sku}`);
        material = {id,sku,name:`${group.name} ${nominal} meter (${capacity} cm)`,category:group.category,unit:'m²',cost:costs.size===1?[...costs][0]:0,supplier:legacy[0]?.supplier || '',active:true,stock:0,minStock:0,stockMethod:'ROLL',stockUnit:'roll',stockNeedsCount:false,rollWidthCm:capacity,nominalRollWidth:Number(nominal),lfRollGroup:group.key};
        state.materials.push(material);
      }
      if (!state.inventory.some(row=>row.materialId===id)) state.inventory.push({sku:material.sku,materialId:id,productName:material.name,category:material.category,width:Number(nominal),quantity:0,minStock:0,unit:'roll',stockUnit:'roll',stockMethod:'ROLL',stockNeedsCount:false,rollWidthCm:capacity,updatedAt:timestamp});
    }
    for (const product of state.products || []) {
      if (!group.products.includes(product.id)) continue;
      product.widths = Object.keys(group.widths).map(Number);
      product.rollCapacities = {...LF_CAPACITIES[product.id]};
      product.rollStockBindings = Object.fromEntries(Object.entries(group.widths).map(([nominal,capacity])=>[nominal,group.legacy.map(sourceMaterialId=>({sourceMaterialId,materialId:`mat-lf-${group.key}-${capacity}`}))]));
    }
  }
  state.lfRollWidthVersion = LF_ROLL_VERSION;
}
