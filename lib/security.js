import {requestContext} from './request-context.js';
import crypto from 'node:crypto';
import {promisify} from 'node:util';
import {clientAddress} from './client-address.js';
import {SecurityStore} from './security-store.js';
import {publicUser} from './access.js';

const scrypt=promisify(crypto.scrypt),MINUTE=60000;
export const SECURITY_VERSION=1, SESSION_AGE=12*60*MINUTE, IDLE_AGE=15*MINUTE;
export const LOGIN_POLICY={attempts:5,delays:[MINUTE,5*MINUTE,15*MINUTE],resetAfter:30*MINUTE,ipAttempts:40,ipWindow:10*MINUTE};
const safeEqual=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);};
export const securityError=(status,message,extra={})=>Object.assign(new Error(message),{status,...extra});
export function reserveAttempt(state,account,ip,now=Date.now()) {
  for(const [key,row] of Object.entries(state.limits))if(now-row.lastFailure>=LOGIN_POLICY.resetAfter)delete state.limits[key];
  const accountKey='account:'+account,ipKey='ip:'+ip;
  let address=state.limits[ipKey];
  if(!address||now-address.startedAt>=LOGIN_POLICY.ipWindow)address={failures:0,startedAt:now,lastFailure:now,blockedUntil:0};
  const entry=state.limits[accountKey] || {failures:0,lastFailure:now,blockedUntil:0};
  const until=Math.max(entry.blockedUntil,address.blockedUntil);
  if(until>now)return {allowed:false,retryAfter:Math.ceil((until-now)/1000)};
  // Count reservations before hashing; concurrent requests cannot exceed five guesses.
  entry.failures++;entry.lastFailure=now;
  if(entry.failures%5===0)entry.blockedUntil=now+LOGIN_POLICY.delays[Math.min(2,Math.floor(entry.failures/5)-1)];
  address.failures++;address.lastFailure=now;
  if(address.failures>=LOGIN_POLICY.ipAttempts)address.blockedUntil=now+MINUTE;
  if(Object.keys(state.limits).length>6000)return {allowed:false,retryAfter:60};
  state.limits[accountKey]=entry;state.limits[ipKey]=address;
  return {allowed:true,accountKey,retryAfter:entry.blockedUntil>now?Math.ceil((entry.blockedUntil-now)/1000):0};
}

export function installSecurityHeaders(app,{production=false,origin}={}) {
  app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data: blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"});
    if(production)res.set('Strict-Transport-Security','max-age=31536000');
    if(req.path.startsWith('/api/')||req.path.startsWith('/print-helper/'))res.set({'Cache-Control':'no-store','Pragma':'no-cache'});
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.path.startsWith('/api/')){
      if(req.headers['sec-fetch-site']==='cross-site')return res.status(403).json({error:'Permintaan harus berasal dari Manna POS'});
      if(req.headers.origin){
        const expected=production?origin:`http://${req.headers.host}`;
        if(req.headers.origin!==expected)return res.status(403).json({error:'Asal permintaan tidak diizinkan'});
      }
      if(req.headers['content-type']&&!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']))return res.status(415).json({error:'Format permintaan harus JSON'});
      if(!req.headers['content-type']&&Number(req.headers['content-length']||0)>0)return res.status(415).json({error:'Format permintaan harus JSON'});
    }
    next();
  });
}

export function createSecurity({app,store,secret,production=false,clock=Date.now}) {
  const database=new SecurityStore(store.pool),key=value=>crypto.createHmac('sha256',secret).update(String(value)).digest('hex');
  const cookieName='manna_session';
  function token(req){const match=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='));const value=match?.slice(cookieName.length+1)||'';return /^[A-Za-z0-9_-]{43}$/.test(value)?value:'';}
  const csrf=value=>key('csrf:'+value);
  const address=req=>clientAddress(req,{render:production&&process.env.RENDER==='true'});
  const account=value=>key('account:'+String(value||'').trim().toLowerCase().slice(0,100));
  function cookie(res,value,maxAge=43200){res.setHeader('Set-Cookie',`${cookieName}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${production?'; Secure':''}`);}
  async function context(req){const value=token(req);if(!value)return null;const row=(await database.read()).sessions[key(value)];if(!row||row.expiresAt<=clock())return null;
    const user=(await store.readUsers()).find(u=>u.id===row.userId&&u.active!==false&&!u.deletedAt&&Number(u.sessionVersion||1)===row.version);if(!user)return null;
    return {row,user,value,digest:key(value),locked:Boolean(row.locked||clock()-row.lastActivity>=IDLE_AGE)};
  }
  async function limited(req,username,check){
    const result=await database.mutate(state=>reserveAttempt(state,account(username),key(address(req)),clock()));
    if(!result.allowed)throw securityError(429,'Terlalu banyak percobaan. Tunggu sebelum mencoba lagi.',{retryAfter:result.retryAfter});
    const user=await check();
    if(!user){await database.event('LOGIN_FAILED',{subject:String(username||'').slice(0,100),source:key(address(req)).slice(0,16)});throw securityError(result.retryAfter?429:401,'Username atau PIN tidak sesuai',{retryAfter:result.retryAfter||undefined,code:'AUTH_FAILED'});}
    await database.mutate(state=>{delete state.limits[result.accountKey];});return user;
  }
  async function verify(username,pin){
    const user=(await store.readUsers()).find(u=>u.username.toLowerCase()===String(username).trim().toLowerCase()&&u.active!==false&&!u.deletedAt);
    const hashed=(await scrypt(String(pin||'').slice(0,128),user?.pinSalt||key('dummy-salt'),32)).toString('hex');
    return user&&safeEqual(hashed,user.pinHash)&&String(pin||'').length<=128?user:null;
  }
  async function issue(req,res,user){
    const value=crypto.randomBytes(32).toString('base64url'),time=clock(),digest=key(value);
    const row={id:crypto.randomUUID(),userId:user.id,version:Number(user.sessionVersion||1),createdAt:time,lastActivity:time,expiresAt:time+SESSION_AGE,locked:false,device:String(req.headers['user-agent']||'Perangkat').slice(0,180),source:key(address(req)).slice(0,16)};
    await database.mutate(state=>{for(const [id,s]of Object.entries(state.sessions))if(s.expiresAt<=time)delete state.sessions[id];const own=Object.entries(state.sessions).filter(([,s])=>s.userId===user.id).sort((a,b)=>a[1].createdAt-b[1].createdAt);while(own.length>=10)delete state.sessions[own.shift()[0]];state.sessions[digest]=row;});
    cookie(res,value);return {csrfToken:csrf(value),user:publicUser(user),pinChangeRequired:Boolean(user.pinChangeRequired)};
  }
  const route=(method,path,fn)=>app[method](path,async(req,res,next)=>{try{await fn(req,res);}catch(error){if(error.retryAfter)res.set('Retry-After',String(error.retryAfter));if([401,403,409,423,429].includes(error.status))res.status(error.status).json({error:error.message,retryAfter:error.retryAfter,code:error.code});else next(error);}});
  route('get','/api/session',async(req,res)=>{const ctx=await context(req);res.json(ctx?{authenticated:true,user:publicUser(ctx.user),locked:ctx.locked,pinRequired:true,csrfToken:csrf(ctx.value),pinChangeRequired:Boolean(ctx.user.pinChangeRequired)}:{authenticated:false,user:null,pinRequired:true});});
  route('post','/api/login',async(req,res)=>{
    const username=String(req.body?.username||'').trim().toLowerCase().slice(0,100),pin=String(req.body?.pin||'');
    const checked=await limited(req,username,()=>verify(username,pin));
    const user=await store.mutate(state=>{const current=state.users.find(u=>u.id===checked.id&&u.active!==false&&!u.deletedAt&&u.pinHash===checked.pinHash&&Number(u.sessionVersion||1)===Number(checked.sessionVersion||1));if(!current)throw securityError(401,'Akun berubah. Silakan masuk kembali.');current.lastLoginAt=new Date(clock()).toISOString();if(production&&pin==='1234')current.pinChangeRequired=true;return structuredClone(current);});
    // Invalidate a previous cookie when switching accounts on the same browser.
    const previous=token(req);if(previous)await database.mutate(state=>{delete state.sessions[key(previous)];});
    const result=await issue(req,res,user);await database.event('LOGIN',{userId:user.id,userName:user.name});res.json({ok:true,...result});
  });
  async function middleware(req,res,next){try{
    const ctx=await context(req);if(!ctx)return res.status(401).json({error:'Sesi berakhir. Silakan masuk kembali.'});
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!safeEqual(req.headers['x-manna-csrf']||'',csrf(ctx.value)))return res.status(403).json({error:'Sesi keamanan berubah. Muat ulang halaman.',code:'CSRF_REQUIRED'});
    const securityPath=req.path.startsWith('/security/');
    if(ctx.locked&&!securityPath&&req.path!=='/logout')return res.status(423).json({error:'POS terkunci. Masukkan PIN untuk melanjutkan.',code:'SESSION_LOCKED'});
    if(ctx.user.pinChangeRequired&&!['/security/pin','/security/lock','/security/unlock','/security/activity','/logout'].includes(req.path))return res.status(423).json({error:'Ganti PIN bawaan sebelum melanjutkan.',code:'PIN_CHANGE_REQUIRED'});
    req.user=ctx.user;req.security=ctx;requestContext.run({userId:ctx.user.id,version:Number(ctx.user.sessionVersion||1)},next);
  }catch(error){next(error);}}
  function registerAuthenticated(){
    route('post','/api/logout',async(req,res)=>{await database.mutate(state=>{delete state.sessions[req.security.digest];});await database.event('LOGOUT',{userId:req.user.id,userName:req.user.name});cookie(res,'',0);res.json({ok:true});});
    const unlocked=req=>{if(req.security.locked)throw securityError(423,'Buka kunci POS terlebih dahulu',{code:'SESSION_LOCKED'});};
    const owner=req=>{unlocked(req);if(req.user.role!=='OWNER')throw securityError(403,'Pengaturan ini hanya untuk Owner');};
    route('post','/api/security/lock',async(req,res)=>{await database.mutate(state=>{const row=state.sessions[req.security.digest];if(row)row.locked=true;});res.json({ok:true});});
    route('post','/api/security/unlock',async(req,res)=>{const checked=await limited(req,req.user.username,()=>verify(req.user.username,req.body?.pin));if(checked.id!==req.user.id||Number(checked.sessionVersion||1)!==req.security.row.version)throw securityError(401,'Akun berubah. Masuk kembali.');await database.mutate(state=>{const row=state.sessions[req.security.digest];if(!row)throw securityError(401,'Sesi telah dicabut');row.locked=false;row.lastActivity=clock();});await database.event('SESSION_UNLOCK',{userId:req.user.id});res.json({ok:true,pinChangeRequired:Boolean(checked.pinChangeRequired)});});
    route('post','/api/security/activity',async(req,res)=>{unlocked(req);await database.mutate(state=>{const row=state.sessions[req.security.digest];if(row)row.lastActivity=clock();});res.json({ok:true});});
    route('get','/api/security/sessions',async(req,res)=>{unlocked(req);const state=await database.read(),users=await store.readUsers();res.json({sessions:Object.values(state.sessions).filter(s=>s.expiresAt>clock()&&users.some(u=>u.id===s.userId&&u.active!==false&&!u.deletedAt&&Number(u.sessionVersion||1)===s.version)&&(s.userId===req.user.id||req.user.role==='OWNER')).map(s=>({id:s.id,userId:s.userId,userName:users.find(u=>u.id===s.userId)?.name || 'Akun',device:s.device,createdAt:s.createdAt,expiresAt:s.expiresAt,current:s.id===req.security.row.id,locked:s.locked||clock()-s.lastActivity>=IDLE_AGE}))});});
    route('delete','/api/security/sessions/:id',async(req,res)=>{unlocked(req);await database.mutate(state=>{const pair=Object.entries(state.sessions).find(([,s])=>s.id===req.params.id);if(!pair||(pair[1].userId!==req.user.id&&req.user.role!=='OWNER'))throw securityError(403,'Sesi tidak dapat diakses');delete state.sessions[pair[0]];});await database.event('SESSION_REVOKE',{userId:req.user.id,targetSessionId:req.params.id});res.json({ok:true});});
    route('get','/api/security/overview',async(req,res)=>{owner(req);const state=await database.read(),users=await store.readUsers();res.json({policy:LOGIN_POLICY,blocked:users.filter(u=>(state.limits['account:'+account(u.username)]?.blockedUntil||0)>clock()).map(u=>({id:u.id,name:u.name,username:u.username,blockedUntil:state.limits['account:'+account(u.username)].blockedUntil})),events:await database.recentEvents()});});
    route('post','/api/security/unblock',async(req,res)=>{owner(req);const reason=String(req.body?.reason||'').trim();if(reason.length<5||reason.length>500)throw securityError(409,'Isi alasan pembukaan pembatasan (5–500 karakter)');await limited(req,req.user.username,()=>verify(req.user.username,req.body.pin));const username=String(req.body.username||'').trim().toLowerCase();if(!(await store.readUsers()).some(u=>u.username===username))throw securityError(409,'Akun tidak ditemukan');await database.mutate(state=>{delete state.limits['account:'+account(username)];});await database.event('LOGIN_UNBLOCK',{userId:req.user.id,userName:req.user.name,subject:username,reason});res.json({ok:true});});
    route('post','/api/security/pin',async(req,res)=>{unlocked(req);const pin=String(req.body?.newPin||'');if(!/^\d{6,12}$/.test(pin)||/^(\d)\1+$/.test(pin)||pin==='123456'||pin==='654321')throw securityError(409,'Gunakan PIN 6–12 digit yang tidak mudah ditebak');const checked=await limited(req,req.user.username,()=>verify(req.user.username,req.body.pin));const salt=crypto.randomBytes(16).toString('hex'),hash=(await scrypt(pin,salt,32)).toString('hex');await store.mutate(state=>{const user=state.users.find(u=>u.id===checked.id&&u.pinHash===checked.pinHash);if(!user)throw securityError(409,'PIN telah berubah');Object.assign(user,{pinSalt:salt,pinHash:hash,pinChangeRequired:false,sessionVersion:Number(user.sessionVersion||1)+1});});await database.mutate(state=>{for(const [id,s]of Object.entries(state.sessions))if(s.userId===checked.id)delete state.sessions[id];});await database.event('PIN_CHANGE',{userId:checked.id});cookie(res,'',0);res.json({ok:true,reauthenticate:true});});
  }
  return {database,isSessionActive:async id=>{const row=Object.values((await database.read()).sessions).find(s=>s.id===id);return Boolean(row&&row.expiresAt>clock()&&!row.locked&&clock()-row.lastActivity<IDLE_AGE);},init:()=>database.init(),middleware,registerAuthenticated,requireOwner:req=>{if(req.security.locked||req.user.pinChangeRequired||req.user.role!=='OWNER')throw securityError(403,'Hanya Owner dengan POS terbuka dapat mengakses backup');},reauthenticate:(req,pin)=>limited(req,req.user.username,()=>verify(req.user.username,pin))};
}
