import test from "node:test";
import assert from "node:assert/strict";
import { ROLE_PRESETS, effectivePermissions, allowedStatusForRole } from "../lib/access.js";
import { Store } from "../lib/store.js";
import { calculateOrder } from "../lib/domain.js";
import { witaDay, completeness, itemChecklist, unconfirmedDraft } from "../public/order-rules.js";
import { briefingForUser, claimBriefing, stockReadiness, repeatQuote, lastCustomerOrder } from "../lib/order-assistance.js";

const at = new Date("2026-10-04T01:00:00Z");
const user = (role, extra={}) => ({ id:role, name:role, role, permissions:ROLE_PRESETS[role].permissions, ...extra });
const order = (id,extra={}) => ({ id, code:id, customerName:"Customer", phone:"08123456789", status:"DESAIN", paymentConfirmed:true, total:100000, paidAmount:0, createdAt:"2026-10-01T00:00:00Z", items:[{productName:"Art Paper",quantity:1,displaySize:"1 lembar"}], ...extra });

test("Manager adalah union tepat empat role; fine tuning tetap menggantikan preset", () => {
  const expected = [...new Set(["CASHIER","DESIGN","PRINT","WAREHOUSE"].flatMap(r=>ROLE_PRESETS[r].permissions))];
  assert.deepEqual(ROLE_PRESETS.MANAGER.permissions,expected);
  assert.ok(!expected.includes("users.manage"));assert.ok(!expected.includes("reports.cost"));assert.ok(!expected.includes("master.products"));
  assert.equal(ROLE_PRESETS.MANAGER.reportScope,"all");
  assert.deepEqual(effectivePermissions(user("MANAGER",{permissions:["projects.orders"]})),["projects.orders"]);
  for(const [current,next] of [["DESAIN","CETAK"],["CETAK","FINISHING"],["FINISHING","SELESAI"],["SELESAI","DIAMBIL"]])assert.equal(allowedStatusForRole("MANAGER",current,next),true);
});

test("briefing memakai tanggal WITA dan prioritas deadline lalu usia menunggu", () => {
  assert.equal(witaDay("2026-10-03T16:01:00Z"),"2026-10-04");
  const state={orders:[
    order("old",{statusEnteredAt:"2026-09-25T00:00:00Z"}),
    order("today",{deadline:"2026-10-04T04:00:00Z"}),
    order("late-new",{deadline:"2026-10-03T04:00:00Z",statusEnteredAt:"2026-10-02T00:00:00Z"}),
    order("late-old",{deadline:"2026-10-03T04:00:00Z",statusEnteredAt:"2026-09-30T00:00:00Z"}),
    order("hold",{hold:{reason:"Approval",since:"2026-09-20T00:00:00Z"}}),
    order("draft",{status:"MENUNGGU_PEMBAYARAN",paymentConfirmed:false}),
    order("cancelled",{cancelledAt:at.toISOString()}),
    order("done-paid",{status:"SELESAI",paidAmount:100000}),
    order("picked-paid",{status:"DIAMBIL",paidAmount:100000})
  ]};
  const briefing=briefingForUser(state,user("MANAGER"),at);
  assert.deepEqual(briefing.orders.map(o=>o.id),["late-old","late-new","today","hold","old"]);
  assert.equal(briefing.overdueCount,2);assert.equal(briefing.todayCount,1);assert.equal(briefing.draftCount,1);
});

test("tagihan yang sudah diambil tetapi belum lunas tetap outstanding; draft dan batal bukan tagihan", () => {
  const state={orders:[order("debt",{status:"DIAMBIL"}),order("waiting",{status:"MENUNGGU_PEMBAYARAN",paymentConfirmed:false,confirmed:true}),order("draft",{status:"MENUNGGU_PEMBAYARAN",paymentConfirmed:false}),order("cancel",{status:"BATAL"})]};
  assert.deepEqual(briefingForUser(state,user("CASHIER"),at).orders.map(o=>o.id),["debt","waiting"]);
  assert.equal(unconfirmedDraft(state.orders[2]),true);assert.equal(unconfirmedDraft(state.orders[1]),false);
});

test("briefing operator memakai kesiapan file yang dikonfirmasi; profil tidak menaikkan izin atau membuka nominal", () => {
  const state={orders:[order("legacy",{fileStatus:"SIAP_CETAK"}),order("ready",{fileReadiness:"READY"}),order("printing",{status:"CETAK"}),order("finishing",{status:"FINISHING"}),order("unpaid-waiting",{status:"MENUNGGU_PEMBAYARAN",paymentConfirmed:false,confirmed:true})]};
  const print=briefingForUser(state,user("PRINT"),at);
  assert.deepEqual(print.orders.map(o=>o.id),["ready","printing"]);
  assert.ok(print.orders.every(o=>!("outstanding" in o)&&!("total" in o)&&!("paidAmount" in o)));
  assert.deepEqual(briefingForUser(state,user("PRINT",{briefingProfile:"finishing"}),at).orders.map(o=>o.id),["finishing"]);
  assert.equal(briefingForUser(state,user("PRINT",{briefingProfile:"all",permissions:[]}),at).count,0);
  assert.equal(briefingForUser(state,user("WAREHOUSE"),at).count,0);
  assert.equal(briefingForUser(state,user("CASHIER",{permissions:["projects.orders"],briefingProfile:"all"}),at).orders.some(o=>"outstanding" in o),false);
});

test("briefing otomatis sekali per akun per tanggal WITA; akun kedua dan hari baru independen", () => {
  const state={users:[user("MANAGER"),user("CASHIER")],orders:[order("active")]};
  assert.equal(claimBriefing(state,"MANAGER",at).show,true);
  assert.equal(claimBriefing(state,"MANAGER",at).show,false);
  assert.equal(claimBriefing(state,"CASHIER",at).show,true);
  assert.equal(claimBriefing(state,"MANAGER",new Date("2026-10-04T16:01:00Z")).show,true);
  state.orders=[];assert.equal(claimBriefing(state,"MANAGER",new Date("2026-10-05T16:01:00Z")).show,false);
});

test("kelengkapan mengikuti produk; ATK tidak perlu file/deadline dan DTF tidak meminta ukuran meter", () => {
  const atk={id:"atk",category:"ATK",retailAtK:true,priceBasis:"unit"};
  assert.deepEqual(completeness({items:[{productId:"atk",quantity:1}]},[atk]),[]);
  const dtf={id:"dtf",category:"Sablon DTF",dtfShirt:true,priceBasis:"unit"};
  const issues=completeness({items:[{productId:"dtf",quantity:1}],fileReadiness:"MISSING"},[dtf]);
  assert.deepEqual(issues.map(i=>i.key),["file","deadline"]);
  assert.equal(issues[0].label,"File desain belum ada");
  const print={id:"print",category:"Outdoor",priceBasis:"sqm"};
  const size=completeness({items:[{productId:"print",quantity:1,width:1,length:0}],fileReadiness:"READY",deadline:at.toISOString()},[print]);
  assert.equal(size[0].type,"specification");
});

test("checklist kartu nama hanya memasukkan finishing yang dipilih dan jumlah kelompoknya", () => {
  const item={productName:"Kartu Nama AP260/2S",quantity:3,displaySize:"3 produk · 2 sisi",finishing:[{id:"lam",name:"Laminasi 2 Sisi",units:2,note:"Kelompok A"}]};
  const steps=itemChecklist(item,{a3ReadyType:"card",category:"Print A3+",unitName:"produk"});
  assert.ok(steps.some(s=>s.key==="cut"));
  assert.ok(steps.some(s=>s.label==="Laminasi 2 Sisi × 2 · Kelompok A"));
  assert.ok(!steps.some(s=>/rounded/i.test(s.label)));
  item.finishing.push({id:"rounded",name:"Rounded",units:3});
  assert.ok(itemChecklist(item,{a3ReadyType:"card"}).some(s=>s.key==="finish:rounded:3"));
});

test("stok menggabungkan bahan/varian lintas item dan alokasi pesanan aktif tanpa mengubah fisik", () => {
  const item=(units)=>({productName:"Paper",materials:[{materialId:"mat",sku:"SKU",units}]});
  const state={inventory:[{materialId:"mat",sku:"SKU",productName:"AP120",unit:"lembar",quantity:100}],orders:[
    order("active",{items:[item(20)]}),order("draft",{items:[item(99)],status:"MENUNGGU_PEMBAYARAN",paymentConfirmed:false}),order("cancel",{items:[item(50)],status:"BATAL"}),order("done",{items:[item(50)],status:"SELESAI",stockCommitted:true})
  ]};
  const current=order("own",{items:[item(60),item(30)]});state.orders.push(current);
  const result=stockReadiness(state,current);
  assert.equal(result.rows.length,1);assert.equal(result.rows[0].required,90);assert.equal(result.rows[0].reserved,20);assert.equal(result.rows[0].available,80);assert.equal(result.rows[0].shortage,10);
  assert.equal(state.inventory[0].quantity,100);
  assert.equal(stockReadiness(state,{...current,stockCommitted:true}).shortages.length,0);
  const missing=stockReadiness({inventory:[],orders:[]},current);assert.equal(missing.rows[0].available,null);assert.equal(missing.rows[0].untracked,true);
});

test("repeat order menghitung ulang katalog, menghapus biaya desain lama, dan menolak produk/finishing yang hilang",async()=>{
  const state=await new Store("").read();
  const product=state.products.find(p=>p.id==="poster-albatros");
  const priced=calculateOrder(state.products,[{productId:product.id,width:.9,length:1,quantity:2,fileServiceId:"DESIGN_A",fileServiceQuantity:3,finishing:[]}]);
  const source=order("source",{items:priced.items,total:priced.total,paidAmount:priced.total,deadline:at.toISOString()});
  product.price+=10000;
  const quote=repeatQuote(state,source,user("CASHIER"));
  assert.equal(quote.canRepeat,true);assert.equal(quote.inputs[0].fileServiceId,"READY");assert.equal(quote.items[0].fileServiceTotal,0);assert.notEqual(quote.total,source.total);assert.equal(quote.deadline,undefined);assert.equal(quote.paidAmount,undefined);
  product.active=false;assert.equal(repeatQuote(state,source,user("CASHIER")).canRepeat,false);product.active=true;
  source.items[0].finishing=[{id:"missing",name:"Removed",units:1}];assert.equal(repeatQuote(state,source,user("CASHIER")).canRepeat,false);
});

test("repeat suggestion membedakan pelanggan bernama sama berdasarkan nomor WA",()=>{
  const state={orders:[order("one"),order("two",{phone:"081111111",createdAt:"2026-10-02T00:00:00Z"})]};
  assert.equal(lastCustomerOrder(state,user("CASHIER"),"Customer","").ambiguous,true);
  assert.equal(lastCustomerOrder(state,user("CASHIER"),"customer","+62 812 3456 789").order.id,"one");
  assert.equal(lastCustomerOrder(state,user("CASHIER"),"Customer","081111111").order.id,"two");
});
