import {A3_TABS,A3_QUICK_LIMIT,a3ProductKind,a3QuickCount} from '../public/a3-selection.js';
import {categoryKey} from './catalog-settings.js';
const isA3=(state,p)=>categoryKey(state.catalogOptions,p.category)==='print-a3';
export function initializeA3Presentation(state){
  if(state.a3QuickPicksVersion===1)return;
  const products=state.products.filter(p=>isA3(state,p));
  // Preserve the former family shortcuts as editable product defaults, once only.
  for(const [kind,families] of [['paper',['Art Paper (AP)','HVS','Bluishwhite']],['sticker',['White Glossy','White Matte','Bontak']]]){
    if(products.some(p=>a3ProductKind(p)===kind&&p.a3Popular!==undefined))continue;
    for(const family of families){const rows=products.filter(p=>!p.deletedAt&&p.active!==false&&a3ProductKind(p)===kind&&p.a3Family===family);const p=rows.find(p=>p.a3PrintMode==='BW'&&p.a3Side==='1S')||rows.find(p=>p.a3Side==='1S')||rows[0];if(p)p.a3Popular=true;}
  }
  for(const p of products){p.a3Popular=p.a3Popular===true;}
  state.a3QuickPicksVersion=1;
}
export function productA3Settings(state,body,current,category){
  if(categoryKey(state.catalogOptions,category)!=='print-a3')return {a3Kind:null,a3Popular:false,preserveLegacy:false};
  const kind=body.a3Kind===undefined?a3ProductKind(current):body.a3Kind;
  if(!A3_TABS.some(([id])=>id===kind))throw new Error('Pilih tab Print A3+: Kertas, Sticker, atau Produk Jadi');
  if(body.a3Popular!==undefined&&typeof body.a3Popular!=='boolean')throw new Error('Pilihan Sering Dipilih tidak valid');
  const popular=body.a3Popular??current?.a3Popular??false;
  const products=state.products.filter(p=>isA3(state,p));
  if(popular&&a3QuickCount(products,kind,current?.id)>=A3_QUICK_LIMIT)throw Object.assign(new Error(`Maksimal ${A3_QUICK_LIMIT} produk Sering Dipilih pada tab ${A3_TABS.find(([id])=>id===kind)[1]}. Nonaktifkan pilihan produk lain terlebih dahulu.`),{status:409,code:'A3_QUICK_LIMIT'});
  return {a3Kind:kind,a3Popular:popular,preserveLegacy:Boolean(current&&isA3(state,current)&&current.a3Kind===kind&&current.a3Family)};
}
