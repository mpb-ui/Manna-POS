import test from 'node:test';
import assert from 'node:assert/strict';
import * as lib from 'pdf-lib';
import { buildPurchaseOrderPdf } from '../public/po-documents.js';
const row={code:'MP-TEST',poNumber:'PO-TEST',nota:{code:'MP-TEST',customerName:'Customer',phone:'081234567890',createdAt:'2026-10-04T13:00:00Z',deadline:null,total:100000,paidAmount:0,items:[{productName:'Print',displaySize:'10 lbr',subtotal:100000,productionNote:'',finishing:[]}]}};
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6X0AAAAASUVORK5CYII=';
test('PDF PO memuat nota dan gambar pada halaman terpisah; nota panjang tidak terpotong',async()=>{
 const bytes=await buildPurchaseOrderPdf(lib,row,png);const pdf=await lib.PDFDocument.load(bytes);
 assert.equal(pdf.getPageCount(),2);assert.equal(pdf.getTitle(),'Nota MP-TEST - PO PO-TEST');
 const imagePage=pdf.getPages()[1];assert.ok(imagePage.node.Resources().lookup(lib.PDFName.of('XObject'),lib.PDFDict).keys().length>0);
 const long=structuredClone(row);long.nota.items=Array.from({length:60},(_,i)=>({...row.nota.items[0],productName:'Produk '+i,productionNote:'Catatan '+('spesifikasi '.repeat(50))}));
 const pages=await lib.PDFDocument.load(await buildPurchaseOrderPdf(lib,long,png));assert.ok(pages.getPageCount()>3);
 const withoutImage=await lib.PDFDocument.load(await buildPurchaseOrderPdf(lib,row,null));assert.equal(withoutImage.getPageCount(),1);
});
