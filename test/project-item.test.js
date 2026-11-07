import test from 'node:test';
import assert from 'node:assert/strict';
import {driveLink,productionDetail,canMoveProduction} from '../public/project-item.js';
import {initializeOrderItems,refreshOrderHold,projectJobs} from '../public/item-workflow.js';

test('link Drive opsional dan hanya HTTPS pada host Google yang tepat',()=>{
 assert.equal(driveLink('  '),'');
 for(const link of ['https://drive.google.com/file/d/test/view','https://drive.google.com/drive/folders/test','https://docs.google.com/document/d/test/edit'])assert.equal(driveLink(link),link);
 for(const link of [null,{},'javascript:alert(1)','http://drive.google.com/test','https://drive.google.com.evil.test/test','https://drive.google.com@evil.test/test','https://user:pass@drive.google.com/test','https://drive.google.com:444/test'])assert.throws(()=>driveLink(link));
});
test('detail produksi proyeksi tanpa uang atau item lain, termasuk field bertingkat',()=>{
 const item={itemId:'first',productName:'Sticker',quantity:2,productionNote:'cut',unitPrice:100,total:100,subtotal:200,fileService:{name:'File Siap Cetak',price:0},materials:[{unitCost:5}],finishing:[{name:'Laminating',units:2,unitPrice:100,subtotal:200}],choices:[{optionLabel:'Cream',price:100}],sheetCalculation:{mode:'capacity',shape:'rectangle',widthCm:10,lengthCm:10,capacity:4,profile:{name:'A3',gapMm:0},areaWidthCm:30,areaLengthCm:45}};
 const order={id:'o',code:'INV',customerName:'A',total:200,paidAmount:10,payments:[{amount:10}],items:[item,{itemId:'second',productName:'Secret'}]};
 const d=productionDetail(order,item),text=JSON.stringify(d);
 for(const key of ['total','paidAmount','payments','unitPrice','unitCost','subtotal','materials','sheetCalculation'])assert.ok(!text.includes('"'+key+'"'),key);
 assert.ok(!text.includes('Secret'));assert.equal(d.itemNumber,1);assert.equal(d.item.productionRevision,0);assert.match(d.item.specification,/4 pcs\/lembar/);
});
test('hold lama hanya diwariskan ke item aktif, tidak menyebar kembali setelah satu item dilepas',()=>{
 const hold={reason:'Menunggu approval customer',since:'2026-10-01',updatedAt:'2026-10-01'};
 const order={id:'o',status:'DESAIN',hold,items:[{status:'DESAIN'},{status:'CETAK'},{status:'SELESAI'}]};
 initializeOrderItems(order);assert.ok(order.items[0].hold);assert.ok(order.items[1].hold);assert.equal(order.items[2].hold,null);
 order.items[0].hold=null;refreshOrderHold(order);initializeOrderItems(order);
 assert.equal(order.items[0].hold,null);assert.ok(order.items[1].hold);assert.deepEqual(projectJobs([order]).map(j=>Boolean(j.hold)),[false,true,false]);
 order.items[1].hold=null;refreshOrderHold(order);assert.equal(order.hold,null);
});
test('akses dropdown mempertahankan hak ubah pekerjaan dan pembatasan Kasir',()=>{
 for(const current of ['DESAIN','CETAK','FINISHING','SELESAI'])for(const target of ['DESAIN','CETAK','FINISHING','SELESAI'])assert.equal(canMoveProduction({role:'PRINT',permissions:['projects.status']},current,target),true);
 assert.equal(canMoveProduction({role:'MANAGER',permissions:['projects.orders']},'DESAIN','CETAK'),false);
 assert.equal(canMoveProduction({role:'CASHIER',permissions:['orders.pickup']},'FINISHING','SELESAI'),true);
 assert.equal(canMoveProduction({role:'CASHIER',permissions:['orders.pickup']},'DESAIN','CETAK'),false);
 assert.equal(canMoveProduction({role:'OWNER',permissions:['projects.status']},'SELESAI','DIAMBIL'),false);
});

test('spesifikasi produksi mempertahankan ukuran asli, lebihan, varian sisi dan kombinasi kaos',()=>{
 const detail=item=>productionDetail({id:'o',items:[item]},item).item;
 const print=detail({productName:'Outdoor',priceBasis:'sqm',imageWidthCm:100,imageLengthCm:120,allowanceCm:5,finalImageWidthCm:110,finalImageLengthCm:130,billedLength:1.5,width:1,quantity:1});
 assert.equal(print.variantSummary,'100 × 120 cm');assert.ok(print.details.includes('Ukuran akhir: 110 × 130 cm'));assert.ok(print.details.includes('Lebihan 5 cm/sisi'));
 const a3=detail({productName:'Kertas',priceBasis:'unit',materialVariantLabel:'Cream',subVariantLabel:'Cetak 1 Sisi',sizeVariantLabel:'A3',quantity:2});assert.equal(a3.variantSummary,'Cream, Cetak 1 Sisi');assert.ok(a3.details.includes('Ukuran: A3'));
 const shirt=detail({productName:'Kaos',priceBasis:'unit',dtfPackageLabel:'A3 1 Sisi',shirtVariants:[{color:'Hitam',size:'XL',quantity:2},{color:'Putih',size:'M',quantity:1}],quantity:3});assert.equal(shirt.variantSummary,'A3 1 Sisi');assert.deepEqual(shirt.details,['Hitam · XL × 2 pcs','Putih · M × 1 pcs']);
});
