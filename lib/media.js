import crypto from 'node:crypto';
import sharp from 'sharp';

sharp.cache({memory:16,files:0,items:20});sharp.concurrency(1);
let processing=false;const waiting=[];
async function acquireDecoder(){if(processing){if(waiting.length>=3)throw Object.assign(new Error('Pemrosesan gambar sedang penuh. Coba lagi sebentar.'),{status:429,retryAfter:2});await new Promise(resolve=>waiting.push(resolve));}else processing=true;return ()=>{const next=waiting.shift();if(next)next();else processing=false;};}
// The decoder, output limits and metadata stay behind this adapter for a future R2 provider.
export async function prepareImage(file,purpose='po'){
  const release=await acquireDecoder();try{return await decodeImage(file,purpose);}finally{release();}
}
async function decodeImage(file,purpose){
  if(!file||typeof file.dataUrl!=='string')throw new Error('Data gambar tidak valid');
  const max=purpose==='campaign'?1024*1024:2621440;
  if(file.dataUrl.length>Math.ceil(max/3)*4+50)throw new Error(purpose==='campaign'?'Thumbnail maksimal 1 MB':'Ukuran gambar PO maksimal 2,5 MB');
  const match=/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(file.dataUrl);
  if(!match||!match[2]||match[2].length%4!==0)throw new Error('Gunakan gambar JPG, PNG, atau WebP yang valid');
  const bytes=Buffer.from(match[2],'base64');if(bytes.length>max||bytes.toString('base64')!==match[2])throw new Error('Data gambar tidak valid atau terlalu besar');
  let result;
  try{
    const decoder=sharp(bytes,{limitInputPixels:24*1024*1024,failOn:'warning',animated:false}),info=await decoder.metadata();
    const format=match[1].toLowerCase().replace('jpg','jpeg');
    if(info.format!==format||(info.pages||1)>1)throw new Error('unsupported');
    const edge=purpose==='campaign'?512:2400;
    result=await decoder.rotate().resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true}).webp({quality:purpose==='campaign'?82:92}).toBuffer({resolveWithObject:true});
  }catch{throw new Error('Isi gambar rusak, format tidak sesuai, atau dimensi terlalu besar');}
  const outputLimit=purpose==='campaign'?96000:max;if(result.data.length>outputLimit)throw new Error('Gambar terlalu kompleks. Kecilkan ukuran gambar lalu coba kembali.');
  const digest=crypto.createHash('sha256').update(result.data).digest('hex');
  return {id:digest,storage:'database',checksum:digest,type:'image/webp',name:String(file.name||'gambar').replace(/[\x00-\x1f\x7f/\\]/g,'').slice(0,150).replace(/\.[^.]+$/,'')+'.webp',size:result.data.length,width:result.info.width,height:result.info.height,dataUrl:'data:image/webp;base64,'+result.data.toString('base64')};
}
export function imageMetadata(file){const {dataUrl,...metadata}=file;return metadata;}
