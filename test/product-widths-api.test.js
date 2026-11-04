import {secureFetch as fetch} from './helpers/http.js';
import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import net from 'node:net';

test('product width API validates categories, keeps existing automatic quotes/history/stock, and supports chips after category rename',async()=>{
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,DATABASE_URL:'',NODE_ENV:'test',PORT:String(port),APP_PIN:'1234'},stdio:'ignore'}),base='http://127.0.0.1:'+port;
 try{
  let ready=false;for(let i=0;i<150;i++){try{ready=(await fetch(base+'/api/health')).ok;if(ready)break;}catch{}await new Promise(r=>setTimeout(r,50));}assert(ready);
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',pin:'1234'})}),cookie=login.headers.get('set-cookie').split(';')[0];
  const req=async(path,method='GET',body)=>{const r=await fetch(base+path,{method,headers:{'content-type':'application/json',cookie},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};const ok=async(...args)=>{const r=await req(...args);assert(r.status>=200&&r.status<300,JSON.stringify(r));return r.body;};
  const initial=await ok('/api/bootstrap?view=master'),oldItems=initial.products.filter(p=>['Outdoor','LF Poster','LF Sticker'].includes(p.category)&&p.priceBasis!=='unit'&&!p.templateProduct).map(p=>({productId:p.id,imageWidthCm:90,imageLengthCm:125,allowanceCm:5,quantity:2,finishing:[]}));
  const quote=await ok('/api/orders/check','POST',{items:oldItems,includeItems:true}),order=await ok('/api/orders','POST',{customerName:'Width history',phone:'4721',items:oldItems}),stock=await ok('/api/bootstrap?view=stock');
  for(const p of initial.products.filter(p=>oldItems.some(i=>i.productId===p.id)))await ok('/api/products/'+p.id,'PUT',p);
  assert.deepEqual(await ok('/api/orders/check','POST',{items:oldItems,includeItems:true}),quote);const history=await ok('/api/order-history/'+order.id);assert.equal(history.total,order.total);assert.deepEqual(history.items,order.items);assert.deepEqual((await ok('/api/bootstrap?view=stock')).inventory,stock.inventory);
  const config={productEditorVersion:1,sku:'WIDTH-CHIPS-QA',name:'Width chips QA',category:'Outdoor',saleUnit:'m²',price:20000,baseCost:0,machineIds:['mach-eco'],materialSources:[],widths:[1.5]};
  let p=await ok('/api/products','POST',config);assert.deepEqual(p.widths,[1.5]);assert.equal(p.rollCapacities[1.5],150);
  const input={productId:p.id,imageWidthCm:120,imageLengthCm:140,quantity:1},outdoor=await ok('/api/orders/check','POST',{items:[input],includeItems:true});assert.equal(outdoor.items[0].width,1.5);assert.equal(outdoor.items[0].billedLength,1.5);assert.equal(outdoor.total,45000);
  for(const widths of [[],[1.27],['bad'],[0],'1,2'])assert.equal((await req('/api/products/'+p.id,'PUT',{...config,widths})).status,400);
  p=await ok('/api/products/'+p.id,'PUT',{...config,category:'LF Sticker',widths:[1]});assert.equal(p.rollCapacities[1],102);assert.deepEqual(p.widths,[1]);assert.equal((await req('/api/products/'+p.id,'PUT',{...config,category:'LF Sticker',widths:[2]})).status,400);
  const sticker=await ok('/api/orders/check','POST',{items:[{...input,imageWidthCm:102,imageLengthCm:200}],includeItems:true});assert.equal(sticker.items[0].rollPlacement.capacityCm,102);assert.equal(sticker.total,40000);
  p=await ok('/api/products/'+p.id,'PUT',{...config,category:'LF Poster',widths:[1.2]});assert.equal(p.rollCapacities[1.2],125);assert.equal((await req('/api/products/'+p.id,'PUT',{...config,category:'LF Poster',widths:[1]})).status,400);
  p=await ok('/api/products/'+p.id,'PUT',{...config,saleUnit:'pcs',widths:[999]});assert.deepEqual(p.widths,[]);
  // A custom category keeps its existing free-entry widths and pricing basis.
  await ok('/api/catalog-options/categories','POST',{label:'Roll Khusus'});const custom=await ok('/api/products/'+p.id,'PUT',{...config,category:'Roll Khusus',widths:[.8,1.27]});assert.deepEqual(custom.widths,[.8,1.27]);
  await ok('/api/categories/products/'+encodeURIComponent('LF Poster'),'PUT',{name:'Poster Indoor'});
  const changed=await ok('/api/products/'+p.id,'PUT',{...config,category:'Poster Indoor',widths:[.9,1.5]});assert.equal(changed.rollCapacities[1.5],152);assert.equal((await req('/api/products/'+p.id,'PUT',{...config,category:'Poster Indoor',widths:[2]})).status,400);

 }finally{child.kill();await new Promise(r=>child.once('exit',r));}
});
