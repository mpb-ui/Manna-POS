import {secureFetch as fetch} from './helpers/http.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';

test('endpoint stok kaos ringan, tanpa nominal, permission POS, dan memakai reservasi pembayaran atomik',async()=>{
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,DATABASE_URL:'',PORT:String(port),APP_PIN:'1234'},stdio:'ignore'}),base=`http://127.0.0.1:${port}`;
 try{
  for(let i=0;i<80;i++){try{if((await fetch(base+'/api/health')).ok)break}catch{}await new Promise(r=>setTimeout(r,100));}
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'admin',pin:'1234'})});const cookie=login.headers.get('set-cookie').split(';')[0];
  const request=async(path,method='GET',body,auth=cookie)=>{const r=await fetch(base+path,{method,headers:{cookie:auth,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,headers:r.headers,body:await r.json()};};
  const ok=async(...args)=>{const r=await request(...args);assert(r.status>=200&&r.status<300,JSON.stringify(r));return r.body;};
  assert.equal((await fetch(base+'/api/pos/shirt-stock')).status,401);
  let response=await request('/api/pos/shirt-stock');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(Object.keys(response.body),['shirtStock']);assert.equal(response.body.shirtStock.length,10);assert(response.body.shirtStock.every(row=>Object.keys(row).every(key=>['materialId','color','size','available'].includes(key))));
  await ok('/api/inventory/KAOS-HIT-M','PATCH',{change:5,reason:'QA stok kaos'});
  const input={customerName:'QA stok',phone:'8988',items:[{productId:'dtf-sablon-kaos',dtfPackageId:'logo',shirtVariants:[{color:'Hitam',size:'M',quantity:3}]}]};
  const a=await ok('/api/orders','POST',input),b=await ok('/api/orders','POST',input);
  assert.equal((await ok('/api/pos/shirt-stock')).shirtStock.find(row=>row.color==='Hitam'&&row.size==='M').available,5);
  const payments=await Promise.all([a,b].map(order=>request(`/api/orders/${order.id}/payments`,'POST',{method:'TUNAI',amount:1})));assert.deepEqual(payments.map(r=>r.status).sort(),[200,400]);
  assert.equal((await ok('/api/pos/shirt-stock')).shirtStock.find(row=>row.color==='Hitam'&&row.size==='M').available,2);
  assert.equal((await ok('/api/bootstrap?view=stock')).inventory.find(row=>row.sku==='KAOS-HIT-M').quantity,5);
  await ok('/api/users','POST',{name:'Gudang QA',username:'shirt-gudang',pin:'7890',role:'WAREHOUSE'});
  const warehouseLogin=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'shirt-gudang',pin:'7890'})});const warehouseCookie=warehouseLogin.headers.get('set-cookie').split(';')[0];assert.equal((await request('/api/pos/shirt-stock','GET',undefined,warehouseCookie)).status,403);
  const productPath='/api/products/dtf-sablon-kaos/dtf-packages';
  const getProduct=async()=>(await ok('/api/bootstrap?view=master')).allProducts.find(product=>product.dtfShirt);
  const product=await getProduct();
  const makeShirt=(size,stock)=>ok('/api/materials','POST',{name:`Kaos Polos Navy ${size}`,sku:`QA-NAVY-${size}`,category:'Kaos Polos DTF',unit:'pcs',stockMethod:'UNIT',stockUnit:'pcs',stock});
  const navyM=await makeShirt('M',4),navyL=await makeShirt('L',6),navy3XL=await makeShirt('3XL',3),navyS=await makeShirt('S',3);
  const variants=[...product.dtfStockVariants,{color:' Navy ',size:'m',materialId:navyM.id},{color:'navy',size:'L',materialId:navyL.id}];
  const body={packages:product.dtfPackages,stockVariants:variants};
  assert.equal((await request(productPath,'PUT',body,warehouseCookie)).status,403);
  for(const invalid of [
    {...body,stockVariants:[...variants,{color:'NAVY',size:' m ',materialId:navy3XL.id}]},
    {...body,stockVariants:[...variants,{color:'Navy',size:'3XL',materialId:navyL.id}]},
    {...body,stockVariants:[...variants,{color:'Navy',size:'3XL',materialId:'mat-not-found'}]},
    {...body,stockVariants:[...variants,{color:'Navy',size:'3XL',materialId:navy3XL.id}]},
    {...body,stockVariants:[]},
    {...body,sizeSurcharges:[{size:'M',amount:-100}]},
    {...body,sizeSurcharges:[{size:'3XL',amount:20000}]}
  ])assert.equal((await request(productPath,'PUT',invalid)).status,400);
  assert.equal((await getProduct()).dtfStockVariants.length,10,'invalid updates are atomic');
  await ok(productPath,'PUT',body);
  const stock=async()=>(await ok('/api/pos/shirt-stock')).shirtStock;
  assert.deepEqual((await stock()).filter(row=>row.color==='Navy').map(row=>[row.size,row.materialId,row.available]),[['M',navyM.id,4],['L',navyL.id,6]]);
  const navyInput=(size,quantity=1)=>({...input,items:[{...input.items[0],shirtVariants:[{color:'Navy',size,quantity}]}]});
  assert.equal((await request('/api/orders','POST',navyInput('XL'))).status,400);
  const oldOrder=await ok('/api/orders','POST',navyInput('M',2));
  assert.equal(oldOrder.total,190000);
  assert.equal(oldOrder.items[0].materials[0].materialId,navyM.id);
  await ok(`/api/orders/${oldOrder.id}/payments`,'POST',{method:'TUNAI',amount:1});
  assert.equal((await stock()).find(row=>row.materialId===navyM.id).available,2);
  // Changing the catalogue leaves confirmed orders bound to their original SKU.
  await ok(productPath,'PUT',{...body,stockVariants:[...variants.filter(row=>row.materialId!==navyM.id),{color:'Navy',size:'S',materialId:navyS.id}],sizeSurcharges:[{size:'s',amount:20000}]});
  assert.equal((await stock()).some(row=>row.materialId===navyM.id),false);
  const priced=await ok('/api/orders','POST',navyInput('S',2));
  assert.equal(priced.total,230000);
  assert.equal(priced.items[0].materials[0].materialId,navyS.id);
  assert.equal((await ok('/api/orders','POST',{...navyInput('XXL'),items:[{...input.items[0],shirtVariants:[{color:'Putih',size:'XXL',quantity:1}]}]})).total,110000);
  // Package totals cross line/color boundaries, while complete HPP overrides material cost.
  await ok('/api/inventory/KAOS-HIT-XXL','PATCH',{change:30,reason:'QA grosir'});
  await ok('/api/inventory/KAOS-PUT-M','PATCH',{change:30,reason:'QA grosir'});
  await ok('/api/materials/'+navyL.id,'PUT',{...navyL,cost:2000});
  const current=await getProduct();
  const packages=current.dtfPackages.map(pack=>pack.id==='logo'?{...pack,baseCost:5000}:pack);
  const prices=Object.fromEntries(packages.map(pack=>[pack.id,pack.price-5000]));
  const wholesaleTiers=[{min:25,max:null,prices}];
  for(const update of [
    {wholesaleTiers:[{min:10,max:25,prices},...wholesaleTiers]},
    {wholesaleTiers:[{min:25,max:null,prices:{logo:90000}}]},
    {packages:packages.map(pack=>({...pack,baseCost:-1}))}
  ])assert.equal((await request(productPath,'PUT',{packages,wholesaleTiers,...update})).status,400);
  await ok(productPath,'PUT',{packages,wholesaleTiers});
  const lines=[
    {...input.items[0],shirtVariants:[{color:'Hitam',size:'XXL',quantity:20}]},
    {...navyInput('L',5).items[0]},
    {...input.items[0],dtfPackageId:'logo-a4',shirtVariants:[{color:'Putih',size:'M',quantity:5}]}
  ];
  const quote=items=>ok('/api/orders/check','POST',{items,includeItems:true});
  assert.deepEqual((await quote(lines)).items.map(item=>[item.unitPrice,item.subtotal,item.baseCostTotal]),[
    [90000,2100000,100000],[90000,450000,25000],[120000,600000,undefined]
  ]);
  assert.equal((await quote([lines[0],navyInput('L',4).items[0]])).items[0].unitPrice,95000);
  const order=await ok('/api/orders','POST',{...input,items:lines});
  const cashier=await ok('/api/users','POST',{name:'Kasir QA',username:'shirt-kasir',pin:'7890',role:'CASHIER'});
  assert.equal(cashier.role,'CASHIER');
  const cashierLogin=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'shirt-kasir',pin:'7890'})});
  const cashierCookie=cashierLogin.headers.get('set-cookie').split(';')[0];
  const cashierProduct=(await ok('/api/bootstrap?view=pos','GET',undefined,cashierCookie)).products.find(p=>p.dtfShirt);
  assert(cashierProduct.dtfPackages.every(pack=>!Object.hasOwn(pack,'baseCost')));
  assert((await ok('/api/orders/check','POST',{items:lines,includeItems:true},cashierCookie)).items.every(item=>!Object.hasOwn(item,'baseCostTotal')));
  await ok(productPath,'PUT',{packages:packages.map(pack=>({...pack,baseCost:null})),wholesaleTiers:[]});
  assert.equal((await quote(lines)).items[0].unitPrice,95000);
  const report=await ok('/api/reports');
  assert.equal(report.rows.find(row=>row.id===order.id).cost,125000,'complete HPP overrides material cost and stays fixed after catalog changes');
  assert.equal((await ok('/api/order-history/'+order.id)).total,order.total);
  const job=`/api/orders/${oldOrder.id}/items/${oldOrder.items[0].itemId}`;
  await ok(job+'/design-pic','PATCH',{designPic:'Gema'});
  await ok(job+'/project-status','PATCH',{status:'CETAK',expectedStatus:'DESAIN'});
  await ok(job+'/project-status','PATCH',{status:'SELESAI',expectedStatus:'CETAK'});
  const inventory=(await ok('/api/bootstrap?view=stock')).inventory;
  assert.equal(inventory.find(row=>row.materialId===navyM.id).quantity,2);
  assert.equal(inventory.find(row=>row.materialId===navyL.id).quantity,6);
  assert.equal(inventory.find(row=>row.materialId===navy3XL.id).quantity,3);
 }finally{child.kill();}
});
