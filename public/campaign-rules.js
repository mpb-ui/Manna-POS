export const CAMPAIGN_HOME_LIMIT=4;
export const CAMPAIGN_ITEM_LIMIT=16;
export const CAMPAIGN_TITLE='Campaign Pilihan';
export const CAMPAIGN_SUBTITLE='Produk yang diprioritaskan untuk ditawarkan.';
export function discountIsActive(product,at=new Date()) {
  const d=product.discount;if(!d?.enabled||!(Number(d.value)>0))return false;
  const t=Number(new Date(at));return (!d.startsAt||t>=Date.parse(d.startsAt))&&(!d.endsAt||t<=Date.parse(d.endsAt));
}
export function defaultCampaign(products,at=new Date()) {
  return {title:CAMPAIGN_TITLE,subtitle:CAMPAIGN_SUBTITLE,guide:'',revision:null,legacy:true,items:products.filter(p=>p.active!==false&&!p.deletedAt&&discountIsActive(p,at)).slice(0,CAMPAIGN_ITEM_LIMIT).map(p=>({id:p.id,productId:p.id,enabled:true,thumbnail:'',startingPrice:null,guide:'',startsAt:'',endsAt:''}))};
}
export function visibleCampaignItems(campaign,products,at=new Date()) {
  const index=new Map(products.filter(p=>p.active!==false&&!p.deletedAt).map(p=>[p.id,p])),t=Number(new Date(at));
  return (campaign?.items || []).filter(row=>row.enabled!==false&&index.has(row.productId)&&(!row.startsAt||t>=Date.parse(row.startsAt))&&(!row.endsAt||t<=Date.parse(row.endsAt))).map(row=>({...row,product:index.get(row.productId)}));
}
export function campaignStartingPrice(row,product,at=new Date()) {
  // A custom advertised starting price is presentation only and never feeds a quote.
  if(row.startingPrice!=null&&row.startingPrice!=='')return Number(row.startingPrice);
  const candidates=[Number(product.cardPrice ?? product.price ?? 0)];
  for(const variant of product.materialVariants || [])if(variant.active!==false){if(variant.price!=null)candidates.push(Number(variant.price));for(const combo of variant.combinations || [])if(combo.active!==false&&combo.price!=null)candidates.push(Number(combo.price));}
  if(product.priceBasis==='unit')for(const variant of [...product.fixedSizeVariants || [],...product.sizeVariants || [],...product.dtfPackages || []])if(variant.active!==false&&variant.price!=null)candidates.push(Number(variant.price));
  let price=Math.min(...candidates.filter(n=>Number.isFinite(n)&&n>=0));
  if(discountIsActive(product,at)){const d=product.discount;price=Math.max(0,d.type==='nominal'?price-Number(d.value):price*(1-Number(d.value)/100));}
  return Math.round(price);
}
export function campaignUnit(product) {return '/'+String(product.unitLabel || product.saleUnit || product.unitName || 'pcs').trim().replace(/^\/\s*/,'');}
