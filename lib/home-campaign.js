import crypto from 'node:crypto';
import {hasPermission} from './access.js';
import {defaultCampaign,visibleCampaignItems,CAMPAIGN_ITEM_LIMIT,CAMPAIGN_TITLE,CAMPAIGN_SUBTITLE} from '../public/campaign-rules.js';
export function readCampaign(state) {return state.homeCampaign || defaultCampaign(state.products || []);}
export function campaignForPos(state) {
  const campaign=readCampaign(state);return {...campaign,items:visibleCampaignItems(campaign,state.products).map(({product,...row})=>row)};
}
export function validateThumbnail(value) {
  const src=String(value || '');if(!src)return '';
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);if(!match)throw new Error('Thumbnail harus berupa gambar PNG, JPG, atau WebP');
  const data=Buffer.from(match[2],'base64');if(data.length>96000)throw new Error('Thumbnail terlalu besar. Unggah ulang untuk mengecilkan gambar.');
  const valid=match[1]==='png'?data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):match[1]==='jpeg'?data[0]===255&&data[1]===216&&data[2]===255:data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP';
  if(!valid)throw new Error('Isi thumbnail tidak sesuai format gambar');return src;
}
function field(value,max,label,fallback='') {const text=String(value ?? fallback).trim();if(text.length>max)throw new Error(`${label} maksimal ${max} karakter`);return text;}
function date(value) {if(!value)return '';const d=new Date(value);if(!Number.isFinite(d.getTime()))throw new Error('Periode campaign tidak valid');return d.toISOString();}
export function normalizeCampaign(body,products) {
  if(!Array.isArray(body.items)||body.items.length>CAMPAIGN_ITEM_LIMIT)throw new Error(`Maksimal ${CAMPAIGN_ITEM_LIMIT} produk campaign`);
  const seen=new Set(),ids=new Set();
  const items=body.items.map(row=>{
    const productId=String(row.productId || ''),p=products.find(p=>p.id===productId&&!p.deletedAt);if(!p)throw new Error('Pilih produk campaign yang masih tersedia');if(seen.has(productId))throw new Error('Produk yang sama hanya boleh ditampilkan sekali');seen.add(productId);
    const id=String(row.id || crypto.randomUUID());if(id.length>100||ids.has(id))throw new Error('Identitas kartu campaign tidak valid');ids.add(id);
    const startingPrice=row.startingPrice==null||row.startingPrice===''?null:Number(row.startingPrice);if(startingPrice!==null&&(!Number.isSafeInteger(startingPrice)||startingPrice<0||startingPrice>1e12))throw new Error('Harga mulai dari harus berupa rupiah bulat yang valid');
    const startsAt=date(row.startsAt),endsAt=date(row.endsAt);if(startsAt&&endsAt&&endsAt<=startsAt)throw new Error('Waktu selesai campaign harus setelah waktu mulai');
    return {id,productId,enabled:row.enabled!==false,startingPrice,thumbnail:validateThumbnail(row.thumbnail),guide:field(row.guide,1500,'Panduan produk'),startsAt,endsAt};
  });
  return {title:field(body.title,80,'Judul',CAMPAIGN_TITLE)||CAMPAIGN_TITLE,subtitle:field(body.subtitle,180,'Keterangan',CAMPAIGN_SUBTITLE),guide:field(body.guide,3000,'Panduan umum'),items};
}
export function registerHomeCampaign(app,{store,audit}) {
  const owner=(req,res,next)=>req.user.role==='OWNER'&&hasPermission(req.user,'master.products')?next():res.status(403).json({error:'Pengaturan campaign hanya untuk Owner dengan akses kelola produk'});
  app.get('/api/home-campaign',owner,async(_req,res,next)=>{try{res.set('Cache-Control','no-store').json({campaign:readCampaign(await store.read())});}catch(error){next(error);}});
  app.put('/api/home-campaign',owner,async(req,res,next)=>{try{
    const campaign=await store.mutate(state=>{
      if((req.body.revision || null)!==(state.homeCampaign?.revision || null))throw Object.assign(new Error('Campaign telah diubah. Muat ulang pengaturan sebelum menyimpan.'),{status:409});
      const before=state.homeCampaign,normalized=normalizeCampaign(req.body,state.products);state.homeCampaign={...normalized,revision:crypto.randomUUID(),updatedAt:new Date().toISOString(),updatedById:req.user.id};
      audit(state,req.user,'HOME_CAMPAIGN_UPDATE','Mengatur campaign pilihan di Home',{previousProductIds:before?.items?.map(r=>r.productId) || [],productIds:normalized.items.map(r=>r.productId)});return state.homeCampaign;
    });res.json({campaign});
  }catch(error){next(error);}});
}
