import crypto from 'node:crypto';
import { ASSET_CATEGORIES, assetToday, assetPeriod, addAssetMonths, calculateAsset, assetSchedule } from '../public/asset-domain.js';
const now=()=>new Date().toISOString();
const clean=(value,max=250)=>String(value || '').trim().slice(0,max);
function date(value) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value) throw new Error('Tanggal aset tidak valid');
  assetPeriod(value.slice(0,7)); return value;
}
function amount(value,label) { const result=Number(value);if(value==null || value==='' || !Number.isSafeInteger(result) || result<0 || result>1e12)throw new Error(`${label} harus berupa nominal rupiah yang valid`);return result; }
function life(value) {const result=Number(value);if(!Number.isInteger(result)||result<1||result>1200)throw new Error('Masa manfaat harus 1–1.200 bulan');return result;}
export function initializeAssets(state) { state.assets ||= []; }
export function findAsset(state,id,revision) {
  const asset=(state.assets || []).find(row=>row.id===id);
  if(!asset)throw new Error('Aset tidak ditemukan');
  if(revision!=null && Number(revision)!==asset.revision)throw new Error('Data aset berubah. Muat ulang sebelum menyimpan.');
  return asset;
}
function event(asset,action,actor,details) {asset.history ||= [];asset.history.unshift({id:crypto.randomUUID(),action,actor,details,createdAt:now()});asset.updatedAt=now();asset.revision+=1;}
export function saveAsset(state,body,id,actor,today=assetToday()) {
  initializeAssets(state); const asset=id?findAsset(state,id,body.revision ?? -1):null;
  if(asset?.archivedAt || asset?.disposal)throw new Error('Aset yang telah dilepas atau diarsipkan tidak dapat diedit');
  const name=clean(body.name), code=clean(body.code,60).toUpperCase(), category=clean(body.category);
  if(!name || !code)throw new Error('Nama dan kode aset wajib diisi');
  if(!ASSET_CATEGORIES.includes(category))throw new Error('Kategori aset tidak valid');
  if(state.assets.some(row=>row.id!==id && row.code.toUpperCase()===code))throw new Error('Kode aset sudah digunakan, termasuk pada riwayat arsip');
  const machineId=clean(body.machineId),machine=machineId?state.machines.find(row=>row.id===machineId):null;
  if(machineId && (!machine || (machine.deletedAt && asset?.machineId!==machineId)))throw new Error('Mesin tidak tersedia');
  if(machineId && category!=='Mesin Produksi')throw new Error('Hubungan mesin hanya untuk kategori Mesin Produksi');
  if(machineId && state.assets.some(row=>row.id!==id && row.machineId===machineId && !row.disposal && !row.cancelled))throw new Error('Mesin sudah terhubung ke aset lain');
  const acquiredDate=date(body.acquiredDate),readyDate=date(body.readyDate);
  if(readyDate<acquiredDate)throw new Error('Tanggal siap digunakan tidak boleh sebelum tanggal perolehan');
  const acquisitionCost=amount(body.acquisitionCost,'Harga perolehan'),residualValue=amount(body.residualValue,'Nilai residu'),usefulLifeMonths=life(body.usefulLifeMonths);
  if(residualValue>acquisitionCost)throw new Error('Nilai residu tidak boleh melebihi harga perolehan');
  const financial={acquiredDate,readyDate,acquisitionCost,residualValue,usefulLifeMonths};
  if(asset && asset.readyDate.slice(0,7)<=today.slice(0,7) && Object.entries(financial).some(([key,value])=>asset[key]!==value))throw new Error('Data perolehan dikunci setelah bulan mulai penyusutan. Gunakan Ubah Estimasi untuk perubahan ke depan.');
  const identity={name,code,category,machineId,machineName:machine?.name || '',location:clean(body.location),assignedTo:clean(body.assignedTo),serialNumber:clean(body.serialNumber),notes:clean(body.notes,2000)};
  if(asset){const before={...Object.fromEntries(Object.keys(identity).map(key=>[key,asset[key]])),...Object.fromEntries(Object.keys(financial).map(key=>[key,asset[key]]))};Object.assign(asset,identity,financial);event(asset,'UPDATE',actor,{before,after:{...identity,...financial}});return asset;}
  const created={id:crypto.randomUUID(),...identity,...financial,method:'STRAIGHT_LINE_MONTHLY',adjustments:[],history:[],revision:0,createdAt:now(),createdBy:actor};event(created,'CREATE',actor,{...identity,...financial});state.assets.push(created);return created;
}
export function adjustAsset(state,id,body,actor,today=assetToday()) {
  const asset=findAsset(state,id,body.revision ?? -1);if(asset.disposal || asset.archivedAt)throw new Error('Aset sudah dilepas atau diarsipkan');
  const effectivePeriod=assetPeriod(body.effectivePeriod),next=addAssetMonths(today.slice(0,7),1);
  if(effectivePeriod<next || effectivePeriod<=asset.readyDate.slice(0,7))throw new Error('Perubahan estimasi berlaku mulai bulan berikutnya dan setelah mulai penyusutan');
  if(asset.adjustments.some(row=>row.effectivePeriod>=effectivePeriod))throw new Error('Bulan perubahan harus setelah perubahan estimasi terakhir');
  const capitalAddition=amount(body.capitalAddition,'Penambahan nilai'),residualValue=amount(body.residualValue,'Nilai residu'),remainingMonths=life(body.remainingMonths),reason=clean(body.reason,1000);
  if(!reason)throw new Error('Alasan perubahan wajib diisi');
  const opening=calculateAsset(asset,addAssetMonths(effectivePeriod,-1)).bookValue+capitalAddition;
  if(residualValue>opening)throw new Error('Nilai residu tidak boleh melebihi nilai buku ditambah penambahan nilai');
  const adjustment={id:crypto.randomUUID(),effectivePeriod,capitalAddition,residualValue,remainingMonths,reason,createdAt:now(),actor};asset.adjustments.push(adjustment);event(asset,'ESTIMATE',actor,adjustment);return asset;
}
export function disposeAsset(state,id,body,actor,today=assetToday()) {
  const asset=findAsset(state,id,body.revision ?? -1);if(asset.disposal || asset.archivedAt)throw new Error('Aset sudah dilepas atau diarsipkan');
  const disposalDate=date(body.date),type=clean(body.type),reason=clean(body.reason,1000),proceeds=amount(body.proceeds,'Hasil pelepasan');
  if(!['SOLD','SCRAPPED'].includes(type) || !reason)throw new Error('Jenis dan alasan pelepasan wajib diisi');
  if(disposalDate.slice(0,7)<today.slice(0,7) || disposalDate<asset.readyDate)throw new Error('Pelepasan tidak boleh mengubah bulan sebelumnya, mendahului penggunaan,');
  if(disposalDate>today)throw new Error('Pelepasan hanya dapat dicatat sampai tanggal hari ini');
  asset.disposal={date:disposalDate,type,proceeds,reason,actor,createdAt:now()};event(asset,'DISPOSE',actor,asset.disposal);return asset;
}
export function archiveAsset(state,id,body,actor,today=assetToday()) {
  const asset=findAsset(state,id,body.revision ?? -1);if(asset.archivedAt)throw new Error('Aset sudah diarsipkan');
  if(!asset.disposal && asset.readyDate.slice(0,7)<=today.slice(0,7))throw new Error('Catat pelepasan aset terlebih dahulu. Aset yang sedang digunakan tidak dapat dihapus.');
  asset.cancelled=!asset.disposal;asset.archivedAt=now();event(asset,'ARCHIVE',actor,{reason:asset.cancelled?'Membatalkan aset yang belum mulai disusutkan':'Mengarsipkan aset yang telah dilepas'});return asset;
}
export function assetReport(state,period=assetToday().slice(0,7)) {
  assetPeriod(period); const rows=(state.assets || []).map(asset=>({...asset,calculation:calculateAsset(asset,period)}));
  const totals=rows.reduce((total,row)=>{const c=row.calculation;total.depreciation+=c.depreciation;total.bookValue+=c.bookValue;total.acquisitionCost+=c.carryingCost;total.accumulatedDepreciation+=c.carryingCost?c.accumulatedDepreciation:0;total.disposalGainLoss+=c.disposalGainLoss;return total;},{depreciation:0,bookValue:0,acquisitionCost:0,accumulatedDepreciation:0,disposalGainLoss:0});
  return {period,rows,totals};
}
export function assetDetail(state,id,from,to) {const asset=findAsset(state,id);return {...asset,schedule:assetSchedule(asset,from,to)};}
