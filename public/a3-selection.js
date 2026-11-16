export const A3_TABS=[['paper','Kertas'],['sticker','Sticker']];
export const A3_QUICK_LIMIT=4;
export const a3ProductKind=product=>product?.a3Kind==='ready'?null:product?.a3Kind==='sticker'?'sticker':'paper';
const compare=(a,b)=>a.localeCompare(b,'id',{numeric:true,sensitivity:'base'});
export function a3Choices(products,kind){
  const choices=new Map();
  for(const product of products){
    if(product.active===false||product.deletedAt||a3ProductKind(product)!==kind)continue;
    const family=product.a3Family;
    const value=family?'family:'+family:'product:'+product.id;
    if(!choices.has(value))choices.set(value,{value,label:family||product.name,product,family:family||null});
  }
  return [...choices.values()].sort((a,b)=>compare(a.label,b.label)||compare(a.value,b.value));
}
export function a3QuickProducts(products,kind){return products.filter(p=>p.a3Popular===true&&p.active!==false&&!p.deletedAt&&a3ProductKind(p)===kind).slice(0,A3_QUICK_LIMIT);}
export function a3QuickCount(products,kind,exceptId){return products.filter(p=>p.id!==exceptId&&!p.deletedAt&&p.a3Popular===true&&a3ProductKind(p)===kind).length;}
