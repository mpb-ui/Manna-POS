import crypto from 'node:crypto';
import {promisify} from 'node:util';
import {gzipSync,gunzipSync} from 'node:zlib';
import {securityError} from './security.js';

const derive=promisify(crypto.scrypt);
export function canonical(value){if(Array.isArray(value))return '['+value.map(v=>canonical(v)??'null').join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).filter(k=>value[k]!==undefined&&typeof value[k]!=='function').sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export const checksum=data=>crypto.createHash('sha256').update(canonical(data)).digest('hex');
export function verifySnapshot(data,digest){
  if(!data||typeof data!=='object'||!['orders','users','products','inventory'].every(k=>Array.isArray(data[k]))||checksum(data)!==digest)throw new Error('Backup tidak lengkap atau checksum tidak sesuai');
  return Object.fromEntries(['orders','users','products','inventory','customers','cashReceipts','depositLedger'].map(k=>[k,(data[k]||[]).length]));
}
export async function encryptBackup(data,passphrase){
  if(typeof passphrase!=='string'||passphrase.length<12||passphrase.length>200)throw securityError(409,'Gunakan frasa sandi backup 12–200 karakter');
  const digest=checksum(data);verifySnapshot(data,digest);
  const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),key=await derive(passphrase,salt,32,{N:32768,maxmem:64*1024*1024});
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from('manna-pos-backup:v1'));
  const encrypted=Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify({schema:1,createdAt:new Date().toISOString(),digest,data})))),cipher.final()]);
  return {format:'manna-pos-encrypted-backup',version:1,kdf:'scrypt-32768',cipher:'aes-256-gcm',salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),content:encrypted.toString('base64')};
}
export async function decryptBackup(archive,passphrase){
  if(typeof passphrase!=='string'||passphrase.length>200||archive?.format!=='manna-pos-encrypted-backup'||archive.version!==1||archive.kdf!=='scrypt-32768'||archive.cipher!=='aes-256-gcm'||typeof archive.content!=='string'||archive.content.length>80*1024*1024)throw new Error('Format backup tidak didukung');
  const salt=Buffer.from(archive.salt||'','base64'),iv=Buffer.from(archive.iv||'','base64'),tag=Buffer.from(archive.tag||'','base64');if(salt.length!==16||iv.length!==12||tag.length!==16)throw new Error('Backup rusak');
  const key=await derive(passphrase,salt,32,{N:32768,maxmem:64*1024*1024}),decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);decipher.setAAD(Buffer.from('manna-pos-backup:v1'));decipher.setAuthTag(tag);
  let document;try{document=JSON.parse(gunzipSync(Buffer.concat([decipher.update(Buffer.from(archive.content,'base64')),decipher.final()]),{maxOutputLength:100*1024*1024}));}catch{throw new Error('Frasa sandi salah atau backup rusak');}
  if(document.schema!==1)throw new Error('Versi backup tidak didukung');return {...document,summary:verifySnapshot(document.data,document.digest)};
}
export class BackupManager {
  constructor(store,{clock=Date.now}={}){this.store=store;this.clock=clock;this.rows=[];this.status={available:false};}
  async init(){if(this.store.pool)await this.store.pool.query('CREATE TABLE IF NOT EXISTS pos_daily_backups(id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), data JSONB NOT NULL, digest TEXT NOT NULL)');await this.capture();}
  async capture(){
    const id='daily:'+new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Makassar'}).format(new Date(this.clock()));
    try{
      if(this.store.pool){
        // A single SELECT captures an atomic JSONB state, including images and ledgers.
        const existing=await this.store.pool.query('SELECT data,digest,created_at FROM pos_daily_backups WHERE id=$1',[id]);
        if(!existing.rows.length){const data=(await this.store.pool.query("SELECT data FROM app_state WHERE id='main'")).rows[0].data;await this.store.pool.query('INSERT INTO pos_daily_backups(id,data,digest) VALUES ($1,$2::jsonb,$3) ON CONFLICT DO NOTHING',[id,JSON.stringify(data),checksum(data)]);}
        const row=(await this.store.pool.query('SELECT data,digest,created_at FROM pos_daily_backups WHERE id=$1',[id])).rows[0];
        const summary=verifySnapshot(row.data,row.digest);this.status={available:true,verified:true,lastBackupAt:row.created_at,summary,retentionDays:30,storage:'postgres'};
        // Prune only daily snapshots after verifying today's copy. Migration backups remain intact.
        await this.store.pool.query("DELETE FROM pos_daily_backups WHERE created_at < NOW() - INTERVAL '30 days'");
        const sizes=(await this.store.pool.query('SELECT id,pg_column_size(data) AS bytes FROM pos_daily_backups ORDER BY created_at DESC')).rows;
        let used=0,kept=0;for(const item of sizes){const bytes=Number(item.bytes);if(kept&&used+bytes>128*1024*1024){await this.store.pool.query('DELETE FROM pos_daily_backups WHERE id=$1',[item.id]);continue;}used+=bytes;kept++;}
        this.status.bytes=used;this.status.snapshotCount=kept;this.status.maxBytes=128*1024*1024;
      }else{let row=this.rows.find(r=>r.id===id);if(!row){const data=structuredClone(this.store.memory);row={id,data,digest:checksum(data),createdAt:new Date(this.clock()).toISOString()};this.rows.unshift(row);this.rows=this.rows.slice(0,30);}this.status={available:true,verified:true,lastBackupAt:row.createdAt,summary:verifySnapshot(row.data,row.digest),retentionDays:30,storage:'memory-development'};}
      return this.status;
    }catch(error){this.status={...this.status,verified:false,error:'Backup harian gagal diverifikasi'};throw error;}
  }
  async list(){return this.store.pool?(await this.store.pool.query('SELECT id,created_at FROM pos_daily_backups ORDER BY created_at DESC LIMIT 30')).rows.map(r=>({id:r.id,createdAt:r.created_at})):this.rows.map(r=>({id:r.id,createdAt:r.createdAt}));}
  async snapshot(id){if(typeof id!=='string'||!/^daily:\d{4}-\d{2}-\d{2}$/.test(id))throw securityError(409,'Pilih snapshot yang valid');const row=this.store.pool?(await this.store.pool.query('SELECT data,digest FROM pos_daily_backups WHERE id=$1',[id])).rows[0]:this.rows.find(r=>r.id===id);if(!row)throw securityError(404,'Snapshot tidak ditemukan');verifySnapshot(row.data,row.digest);return row.data;}
  start(){this.timer=setInterval(()=>this.capture().catch(()=>console.error('Daily backup failed; Owner overview shows the failure')),60*60*1000);this.timer.unref();}
  stop(){clearInterval(this.timer);}
}
export function registerBackupRoutes(app,{store,security,backups}){
  const route=(path,handler)=>app.post(path,async(req,res,next)=>{try{security.requireOwner(req);await handler(req,res);}catch(error){if(error.retryAfter)res.set('Retry-After',String(error.retryAfter));next(error);}});
  app.get('/api/security/backups',async(req,res,next)=>{try{security.requireOwner(req);res.json({...backups.status,snapshots:await backups.list()});}catch(error){next(error);}});
  route('/api/security/backups/check',async(req,res)=>{res.json(await backups.capture());});
  route('/api/security/backups/export',async(req,res)=>{
    await security.reauthenticate(req,req.body.pin);
    const data=req.body.snapshotId?await backups.snapshot(req.body.snapshotId):store.pool?(await store.pool.query("SELECT data FROM app_state WHERE id='main'")).rows[0].data:structuredClone(store.memory);
    const archive=await encryptBackup(data,req.body.passphrase);
    // Test the export itself, not only the unencrypted source snapshot.
    const restored=await decryptBackup(archive,req.body.passphrase);verifySnapshot(restored.data,checksum(data));
    await security.database.event('BACKUP_EXPORT',{userId:req.user.id,userName:req.user.name,summary:restored.summary});
    res.set('Content-Disposition',`attachment; filename="manna-pos-backup-${new Date().toISOString().slice(0,10)}.mannabackup"`).json(archive);
  });
}
