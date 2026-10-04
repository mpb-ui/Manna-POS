import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { witaDay } from "../public/order-rules.js";

test("akses Manager, briefing lintas sesi, hold, file, checklist, dan repeat terjaga di API",async()=>{
  const socket=net.createServer();await new Promise(resolve=>socket.listen(0,"127.0.0.1",resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  const child=spawn(process.execPath,[new URL("../server.js",import.meta.url).pathname],{cwd:new URL("..",import.meta.url).pathname,env:{...process.env,DATABASE_URL:"",PORT:String(port),APP_PIN:"1234"},stdio:"ignore"});
  const root=`http://127.0.0.1:${port}`;
  try{
    let ready=false;for(let n=0;n<100;n++){try{ready=(await fetch(root+"/api/health")).ok;}catch{}if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(ready);
    async function login(username,pin="5678"){const response=await fetch(root+"/api/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username,pin})});assert.equal(response.status,200);return response.headers.get("set-cookie").split(";")[0];}
    const owner=await login("admin","1234");
    async function request(path,method="GET",body,cookie=owner){const response=await fetch(root+path,{method,headers:{"content-type":"application/json",cookie},body:body==null?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
    async function ok(path,method,body,cookie){const result=await request(path,method,body,cookie);assert.ok(result.status>=200&&result.status<300,JSON.stringify(result));return result.body;}
    for(const [role,username,profile]of[["MANAGER","manager","auto"],["PRINT","printer","auto"],["PRINT","finishing","finishing"],["CASHIER","cashier","auto"],["WAREHOUSE","warehouse","auto"]])await ok("/api/users","POST",{name:username,username,pin:"5678",role,briefingProfile:profile});
    const manager=await login("manager"),printer=await login("printer"),finishing=await login("finishing"),warehouse=await login("warehouse");
    const bootstrap=await ok("/api/bootstrap",undefined,undefined,manager);assert.equal(bootstrap.currentUser.role,"MANAGER");assert.ok(bootstrap.permissions.includes("stock.adjust"));assert.ok(bootstrap.permissions.includes("projects.status"));assert.ok(!bootstrap.permissions.includes("users.manage"));
    assert.equal((await request("/api/users","POST",{name:"bad",username:"bad",pin:"5678",role:"OWNER"},manager)).status,403);
    assert.equal((await request("/api/employees","GET",undefined,manager)).status,403);
    assert.equal((await request("/api/assets","GET",undefined,manager)).status,403);
    const draft=await ok("/api/orders","POST",{customerName:"Draft Only",items:[{productId:"poster-albatros",width:.9,length:1,quantity:1,finishing:[]}]},manager);
    const active=await ok("/api/orders","POST",{customerName:"Active Invoice",phone:"08123456789",confirmed:true,deadline:"2026-10-04T17:00:00+08:00",items:[{productId:"a3-ready-kartu-nama-ap260-2s",quantity:2,finishing:[{id:"fin-a3-card-lam-2",units:1}]}]},manager);
    let briefing=await ok("/api/briefing",undefined,undefined,manager);assert.equal(briefing.draftCount,1);assert.ok(!briefing.orders.some(o=>o.id===draft.id));assert.ok(briefing.orders.some(o=>o.id===active.id));
    const opened=await ok("/api/briefing/open","POST",{},manager);assert.equal(opened.show,true);assert.equal((await ok("/api/briefing/open","POST",{},await login("manager"))).show,false);
    await ok("/api/briefing/read","POST",{date:witaDay()},manager);assert.equal((await ok("/api/briefing",undefined,undefined,manager)).read,true);
    assert.equal((await request("/api/briefing/read","POST",{date:"2099-01-01"},manager)).status,400);
    assert.equal((await ok("/api/briefing",undefined,undefined,warehouse)).count,0);
    await ok(`/api/orders/${active.id}/payments`,"POST",{method:"TUNAI",amount:1},manager);
    await ok(`/api/orders/${active.id}/design-pic`,"PATCH",{designPic:"Gema"},manager);
    assert.equal((await ok("/api/briefing",undefined,undefined,printer)).count,0);
    await ok(`/api/orders/${active.id}/file-readiness`,"PATCH",{fileReadiness:"READY"},manager);
    briefing=await ok("/api/briefing",undefined,undefined,printer);assert.equal(briefing.count,1);assert.ok(!("outstanding" in briefing.orders[0]));assert.ok(!("total" in briefing.orders[0]));
    assert.ok(!("outstanding" in await ok(`/api/orders/${active.id}/assistance`,undefined,undefined,printer)));
    assert.equal((await ok(`/api/orders/${active.id}/assistance`,undefined,undefined,manager)).outstanding,active.total-1);
    assert.equal((await request(`/api/orders/${active.id}/assistance`,"GET",undefined,warehouse)).status,404);
    await ok(`/api/orders/${active.id}/hold`,"PATCH",{reason:"Menunggu approval customer",note:"Proof kedua"},manager);
    const held=await request(`/api/orders/${active.id}/status`,"PATCH",{status:"CETAK"},manager);assert.equal(held.status,409);assert.equal(held.body.code,"ORDER_HELD");
    const original=await ok(`/api/orders/${active.id}/assistance`,undefined,undefined,manager);assert.ok(original.timeline.some(t=>t.message.includes("Proof kedua")));
    await ok(`/api/orders/${active.id}/hold`,"PATCH",{release:true},manager);
    const checked=await ok(`/api/orders/${active.id}/checklist`,"PATCH",{index:0,key:"file",done:true},manager);assert.equal(checked.checklist[0].steps.find(s=>s.key==="file").actor,"manager");
    assert.ok(!checked.checklist[0].steps.some(s=>/Rounded/.test(s.label)));
    assert.equal((await request(`/api/orders/${active.id}/checklist`,"PATCH",{index:0,key:"finish:fin-a3-card-rounded:1",done:true},manager)).status,400);
    assert.equal((await request(`/api/orders/${active.id}/checklist`,"PATCH",{index:0,key:"file",done:false},await login("cashier"))).status,403);
    await ok(`/api/orders/${active.id}/deadline`,"PATCH",{deadline:"2026-10-05T17:00:00+08:00"},manager);
    await ok(`/api/orders/${active.id}/status`,"PATCH",{status:"CETAK",confirmChecklist:true},manager);
    const response=await ok(`/api/orders/${active.id}/status`,"PATCH",{status:"FINISHING",confirmChecklist:true},printer);assert.ok(!("total" in response));assert.equal(response.status,"FINISHING");
    briefing=await ok("/api/briefing",undefined,undefined,finishing);assert.equal(briefing.count,1);assert.ok(!("outstanding" in briefing.orders[0]));
    const repeat=await ok(`/api/orders/${active.id}/repeat`,"POST",{},manager);assert.equal(repeat.canRepeat,true);assert.ok(repeat.stock);assert.equal(repeat.inputs[0].finishing[0].id,"fin-a3-card-lam-2");assert.equal(repeat.inputs[0].fileServiceId,"READY");assert.equal(repeat.paidAmount,undefined);
    assert.equal((await request(`/api/orders/${active.id}/repeat`,"POST",{},printer)).status,403);
    const suggestion=await ok("/api/repeat-order?customerName=Active+Invoice&phone=08123456789",undefined,undefined,manager);assert.equal(suggestion.order.id,active.id);
    const inventoryBefore=(await ok("/api/bootstrap",undefined,undefined,manager)).inventory;
    await ok("/api/orders/check","POST",{items:[{productId:"poster-albatros",width:.9,length:1,quantity:3,finishing:[]}]},manager);
    assert.deepEqual((await ok("/api/bootstrap",undefined,undefined,manager)).inventory,inventoryBefore);
    assert.equal((await request("/api/orders/check","POST",{items:[]},printer)).status,403);
    const managerUser=(await ok("/api/bootstrap")).users.find(u=>u.username==="manager");
    await ok(`/api/users/${managerUser.id}`,"PUT",{name:managerUser.name,username:managerUser.username,role:"MANAGER",permissions:["projects.orders"],briefingProfile:"all"});
    assert.equal((await request(`/api/orders/${active.id}/deadline`,"PATCH",{deadline:"2026-10-06T12:00:00+08:00"},manager)).status,403);
    assert.equal((await request(`/api/orders/${active.id}/status`,"PATCH",{status:"SELESAI"},manager)).status,403);
    assert.equal((await request(`/api/orders/${active.id}/repeat`,"POST",{},manager)).status,403);
    assert.ok((await ok("/api/briefing",undefined,undefined,manager)).orders.every(o=>!("outstanding" in o)));
  }finally{child.kill();await new Promise(resolve=>child.once("exit",resolve));}
});
