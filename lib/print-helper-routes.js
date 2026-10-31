import crypto from 'node:crypto';
import { hasPermission, orderVisibleToUser } from './access.js';
import { cancelled, paymentHistoryVisible } from '../public/order-rules.js';
import { printDocumentData } from './print-document.js';
export const PRINT_HELPER_VERSION='1.0.0';
export const PRINT_HELPER_DOWNLOAD='https://github.com/mpb-ui/Manna-POS/releases/download/print-helper-v1.0.0/MannaPrintHelper-Windows-x64.zip';
const failure=(message,status=400)=>Object.assign(new Error(message),{status});
const digest=token=>crypto.createHash('sha256').update(token).digest('hex');
const kinds=['invoice','payment','work-order'];
function authorize(order,user,kind){
  if(!order || !orderVisibleToUser(order,user))throw failure('Pesanan tidak ditemukan',404);
  if(kind==='work-order'){
    if(!hasPermission(user,'orders.view')&&!hasPermission(user,'projects.orders'))throw failure('Tidak memiliki akses Work Order',403);
    if(cancelled(order)||['DRAFT','MENUNGGU_PEMBAYARAN'].includes(order.status))throw failure('Work Order belum tersedia untuk status pesanan ini',409);
  }else{
    if(!hasPermission(user,'orders.view')||!hasPermission(user,'projects.money'))throw failure('Tidak memiliki akses nota pembayaran',403);
    if(kind==='payment'&&!paymentHistoryVisible(user.role))throw failure('Riwayat pembayaran hanya tersedia untuk Owner, Manager, dan Kasir',403);
  }
}
export function registerPrintHelper(app,{store,normalizeOrder,clock=()=>Date.now(),ttl=180000,maxJobs=100}){
  const jobs=new Map();
  const prune=()=>{for(const [key,job] of jobs)if(job.expires<=clock())jobs.delete(key);};
  const noStore=res=>res.set({'Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff'});
  const publicStatus=job=>({id:job.id,status:job.status,expiresAt:new Date(job.expires).toISOString(),downloadUrl:PRINT_HELPER_DOWNLOAD,version:PRINT_HELPER_VERSION});
  // Outside /api cookie middleware: the native client redeems one short-lived
  // capability in an Authorization header. It never receives a browser session.
  app.post('/print-helper/claim',async(req,res,next)=>{
    noStore(res);prune();
    try{
      const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '')?.[1];
      const job=token&&jobs.get(digest(token));
      if(!job || job.status!=='waiting')throw failure('Permintaan cetak kedaluwarsa atau sudah digunakan. Klik cetak kembali dari POS.',410);
      const state=await store.read(),user=state.users.find(u=>u.id===job.userId&&u.active!==false&&!u.deletedAt&&Number(u.sessionVersion || 1)===job.sessionVersion);
      if(!user)throw failure('Akses akun sudah berakhir. Klik cetak kembali setelah login.',403);
      const order=state.orders.find(o=>o.id===job.orderId);authorize(order,user,job.kind);
      if((order.updatedAt || '')!==job.updatedAt)throw failure('Pesanan telah berubah. Klik cetak kembali dari POS.',409);
      // Re-check after the await: concurrent claims cannot both receive data.
      if(job.status!=='waiting'||job.expires<=clock())throw failure('Permintaan cetak sudah digunakan atau kedaluwarsa.',410);
      job.status='received';const document=job.document;delete job.document;
      res.json({version:PRINT_HELPER_VERSION,document});
    }catch(error){if(error.status)return res.status(error.status).json({error:error.message});next(error);}
  });
  app.post('/print-helper/status',async(req,res,next)=>{
    noStore(res);prune();
    try{
      const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization || '')?.[1],job=token&&jobs.get(digest(token));
      if(!job||job.status!=='received')throw failure('Permintaan cetak tidak aktif',410);
      if(!['opened','failed'].includes(req.body.status))throw failure('Status cetak tidak valid');
      job.status=req.body.status;res.json({ok:true});
    }catch(error){if(error.status)return res.status(error.status).json({error:error.message});next(error);}
  });
  // Register these after cookie authentication is installed in server.js.
  return function registerAuthenticated(){
    app.get('/api/print-helper',(_req,res)=>{noStore(res);res.json({version:PRINT_HELPER_VERSION,downloadUrl:PRINT_HELPER_DOWNLOAD});});
    app.post('/api/print-jobs',async(req,res,next)=>{
      noStore(res);prune();
      try{
        const {kind,orderId,paymentId}=req.body || {};
        if(!kinds.includes(kind)||typeof orderId!=='string'||orderId.length>150||kind==='payment'&&typeof paymentId!=='string')throw failure('Jenis dokumen cetak tidak valid');
        if(jobs.size>=maxJobs)throw failure('Antrean cetak sedang penuh. Coba sebentar lagi.',429);
        if([...jobs.values()].filter(j=>j.userId===req.user.id&&j.created>clock()-60000).length>=12)throw failure('Terlalu banyak permintaan cetak. Tunggu sebentar.',429);
        const state=await store.read(),order=state.orders.find(o=>o.id===orderId);authorize(order,req.user,kind);
        const document=printDocumentData({...normalizeOrder(structuredClone(order)),printRole:req.user.role},kind,paymentId,state.cashReceipts || []);
        if(Buffer.byteLength(JSON.stringify(document))>512000)throw failure('Dokumen terlalu besar untuk dicetak sekaligus. Hubungi Owner.',413);
        // Limit after await as well, for simultaneous creation requests.
        prune();if(jobs.size>=maxJobs)throw failure('Antrean cetak sedang penuh.',429);
        if([...jobs.values()].filter(j=>j.userId===req.user.id&&j.created>clock()-60000).length>=12)throw failure('Terlalu banyak permintaan cetak. Tunggu sebentar.',429);
        const token=crypto.randomBytes(32).toString('base64url'),job={id:crypto.randomUUID(),userId:req.user.id,sessionVersion:Number(req.user.sessionVersion || 1),orderId,updatedAt:order.updatedAt || '',kind,document,status:'waiting',created:clock(),expires:clock()+ttl};
        jobs.set(digest(token),job);
        res.status(201).json({...publicStatus(job),launchUrl:'mannaprint://open?job='+token});
      }catch(error){if(error.status)return res.status(error.status).json({error:error.message});next(error);}
    });
    app.get('/api/print-jobs/:id',(req,res)=>{
      noStore(res);prune();const job=[...jobs.values()].find(j=>j.id===req.params.id&&j.userId===req.user.id&&j.sessionVersion===Number(req.user.sessionVersion || 1));
      if(!job)return res.status(404).json({error:'Permintaan cetak tidak ditemukan atau sudah kedaluwarsa'});
      res.json(publicStatus(job));
    });
  };
}
