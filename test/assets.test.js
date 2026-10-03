import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAsset, assetSchedule, addAssetMonths } from '../public/asset-domain.js';
import { saveAsset, adjustAsset, disposeAsset, archiveAsset, assetReport } from '../lib/assets.js';
const today='2026-10-03';
const input={name:'Mesin Cetak',code:'AST-01',category:'Mesin Produksi',machineId:'m',acquiredDate:'2026-01-01',readyDate:'2026-01-10',acquisitionCost:300000000,residualValue:30000000,usefulLifeMonths:60};
const data=()=>({assets:[],machines:[{id:'m',name:'Roland',code:'R'}]});
const make=()=>{const state=data();const asset=saveAsset(state,input,null,'Owner',today);return {state,asset};};
test('garis lurus bulanan dimulai saat siap digunakan, menyisakan residu dan tidak menyusut di bawahnya',()=>{
 const {asset}=make();assert.equal(calculateAsset(asset,'2025-12').depreciation,0);assert.equal(calculateAsset(asset,'2026-01').depreciation,4500000);assert.equal(calculateAsset(asset,'2026-10').bookValue,255000000);assert.equal(calculateAsset(asset,'2030-12').bookValue,30000000);assert.equal(calculateAsset(asset,'2031-01').depreciation,0);assert.equal(calculateAsset(asset,'2031-01').status,'FULLY_DEPRECIATED');
});
test('pembulatan kumulatif mencapai residu tepat dan beban total tidak bergeser',()=>{
 const asset={...make().asset,acquisitionCost:1000,residualValue:1,usefulLifeMonths:7};const rows=assetSchedule(asset,'2026-01','2026-07');assert.equal(rows.reduce((s,r)=>s+r.depreciation,0),999);assert.equal(rows.at(-1).bookValue,1);assert.equal(calculateAsset(asset,'2026-08').depreciation,0);
});
test('aset lama memakai tanggal aslinya dan tidak dimulai ulang saat dicatat',()=>{
 const state=data(),asset=saveAsset(state,{...input,readyDate:'2020-01-01',acquiredDate:'2020-01-01'},null,'Owner',today);assert.equal(calculateAsset(asset,'2026-10').bookValue,30000000);assert.equal(calculateAsset(asset,'2026-10').depreciation,0);
});
test('perubahan estimasi ke depan menyimpan bulan sebelumnya dan mengakomodasi penambahan nilai',()=>{
 const {state,asset}=make();const before=calculateAsset(asset,'2026-10');const adjusted=adjustAsset(state,asset.id,{revision:asset.revision,effectivePeriod:'2026-11',remainingMonths:50,residualValue:30000000,capitalAddition:25000000,reason:'Upgrade'},'Owner',today);
 assert.deepEqual(calculateAsset(adjusted,'2026-10'),before);const next=calculateAsset(adjusted,'2026-11');assert.equal(next.depreciation,5000000);assert.equal(next.capitalAddition,25000000);assert.equal(next.bookValue,275000000);assert.equal(calculateAsset(adjusted,'2030-12').bookValue,30000000);assert.equal(adjusted.history[0].action,'ESTIMATE');
 assert.throws(()=>adjustAsset(state,asset.id,{revision:asset.revision,effectivePeriod:'2026-10'},'Owner',today),/bulan berikutnya/);
});
test('perolehan terkunci, kode dan mesin unik, revisi lama atau hilang ditolak',()=>{
 const {state,asset}=make();assert.throws(()=>saveAsset(state,{...input,acquisitionCost:300000001,revision:asset.revision},asset.id,'Owner',today),/dikunci/);assert.throws(()=>saveAsset(state,{...input},asset.id,'Owner',today),/berubah/);
 assert.throws(()=>saveAsset(state,{...input,code:'AST-02'},null,'Owner',today),/terhubung/);assert.throws(()=>saveAsset(state,{...input,machineId:''},null,'Owner',today),/Kode/);
 const updated=saveAsset(state,{...input,name:'Mesin Baru',revision:asset.revision},asset.id,'Owner',today);assert.equal(updated.name,'Mesin Baru');assert.equal(updated.revision,2);assert.throws(()=>saveAsset(state,{...input,revision:1},asset.id,'Owner',today),/berubah/);
});
test('pelepasan menghentikan penyusutan tanpa mengubah bulan lampau; arsip mempertahankan riwayat dan laporan',()=>{
 const {state,asset}=make();const before=calculateAsset(asset,'2026-09');disposeAsset(state,asset.id,{revision:asset.revision,date:today,type:'SOLD',proceeds:200000000,reason:'Upgrade mesin'},'Owner',today);
 assert.deepEqual(calculateAsset(asset,'2026-09'),before);const row=calculateAsset(asset,'2026-10');assert.equal(row.depreciation,0);assert.equal(row.bookValue,0);assert.equal(row.disposalBookValue,259500000);assert.equal(row.disposalGainLoss,-59500000);assert.equal(calculateAsset(asset,'2026-11').disposalGainLoss,0);
 archiveAsset(state,asset.id,{revision:asset.revision},'Owner',today);assert.equal(assetReport(state,'2026-09').totals.bookValue,before.bookValue);assert.equal(state.assets.length,1);assert.equal(asset.history.length,3);
});
test('aset aktif tidak boleh dihapus; aset masa depan bisa dibatalkan tanpa beban',()=>{
 const {state,asset}=make();assert.throws(()=>archiveAsset(state,asset.id,{revision:asset.revision},'Owner',today),/pelepasan/);
 const planned=saveAsset(state,{...input,machineId:'',code:'AST-02',readyDate:'2026-11-01'},null,'Owner',today);archiveAsset(state,planned.id,{revision:planned.revision},'Owner',today);assert.equal(calculateAsset(planned,'2026-12').depreciation,0);assert.equal(calculateAsset(planned,'2026-12').status,'CANCELLED');
});
test('mesin dihapus atau maintenance tidak mengubah aset dan beban penyusutan',()=>{
 const {state,asset}=make();state.machines[0].deletedAt=today;state.machines[0].status='MAINTENANCE';assert.equal(assetReport(state,'2026-10').totals.depreciation,4500000);saveAsset(state,{...input,name:'Nama aset diubah',revision:asset.revision},asset.id,'Owner',today);assert.equal(asset.machineId,'m');assert.equal(asset.machineName,'Roland');
});
test('tanggal, nilai, residu, masa manfaat, rentang jadwal dan pelepasan lampau divalidasi',()=>{
 for(const values of [{readyDate:'2026-02-31'},{acquisitionCost:-1},{residualValue:300000001},{usefulLifeMonths:0},{usefulLifeMonths:2.5},{category:'Tidak Ada'}])assert.throws(()=>saveAsset(data(),{...input,...values},null,'Owner',today));
 const {state,asset}=make();assert.throws(()=>assetSchedule(asset,'2026-01','2040-01'),/120/);assert.throws(()=>disposeAsset(state,asset.id,{revision:asset.revision,date:'2026-09-30',type:'SOLD',proceeds:0,reason:'Salah'},'Owner',today),/sebelumnya/);assert.equal(addAssetMonths('2026-12',1),'2027-01');
});
test('estimasi terjadwal setelah pelepasan tidak diterapkan; riwayatnya tetap tersimpan',()=>{
 const {state,asset}=make();adjustAsset(state,asset.id,{revision:asset.revision,effectivePeriod:'2026-11',remainingMonths:50,residualValue:30000000,capitalAddition:25000000,reason:'Rencana upgrade'},'Owner',today);disposeAsset(state,asset.id,{revision:asset.revision,date:today,type:'SCRAPPED',proceeds:0,reason:'Rusak'},'Owner',today);assert.equal(calculateAsset(asset,'2026-11').bookValue,0);assert.equal(calculateAsset(asset,'2026-11').capitalAddition,0);assert.equal(asset.adjustments.length,1);
});

test('inisialisasi store hanya menyiapkan daftar kosong tanpa mengubah mesin atau pesanan lama',async()=>{
 const {Store}=await import('../lib/store.js');const store=new Store();store.memory.orders.push({id:'old',items:[],createdAt:'2020-01-01'});const machines=structuredClone(store.memory.machines);const read=await store.read();assert.deepEqual(read.assets,[]);assert.deepEqual(read.machines,machines);assert.equal(read.orders[0].id,'old');
});
