package id.manna.print;
import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.*;
import net.sf.jasperreports.engine.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class ReceiptRendererTest {
 final ObjectMapper json=new ObjectMapper();
 ObjectNode fixture(){
  ObjectNode d=json.createObjectNode();d.put("schemaVersion",1).put("kind","invoice").put("code","INV-103126-001").put("customerName","Smoke House").put("phone","1172").put("date","31 Okt 2026, 09:00 WITA").put("shopName","Manna Print").put("shopAddress","Jl. Mangga Golek, Labuan Bajo | WA: 082247299578").put("status","Belum Lunas").put("cashier","Kasir").put("sequence",1).put("footer","Harap bawa nota ini saat pengambilan barang.\nRetur barang defect mengikuti ketentuan toko.").put("slogan","Print apa saja, di Manna aja!");
  d.putArray("items").addObject().put("name","Kalender Dinding").put("quantity","2 pcs").put("price","Rp 220.000").put("note","12 lembar + 1 cover").putArray("details").add("Ukuran A3");
  d.putArray("rows").addObject().put("label","Grand Total").put("value","Rp 220.000").put("style","grand");return d;
 }
 @Test void singlePageHeightIncludesAllItemsAndFooter() throws Exception {
  ObjectNode d=fixture();JasperPrint shortReport=new ReceiptRenderer().render(d);ArrayNode items=(ArrayNode)d.path("items");
  for(int i=0;i<30;i++)items.addObject().put("name","Produk panjang ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMN "+i).put("quantity","100.000 lbr").put("price","Rp 9.999.999.999").put("note","Ukuran 80 × 85 cm\nJangan dilipat\nLebihan 5 cm/sisi").putArray("details").add("Cream, Cetak 1 Sisi");
  JasperPrint report=new ReceiptRenderer().render(d);assertEquals(1,report.getPages().size());assertTrue(report.getPageHeight()>shortReport.getPageHeight());
  StringBuilder texts=new StringBuilder();for(JRPrintElement e:report.getPages().get(0).getElements()){
   assertTrue(e.getX()>=0&&e.getX()+e.getWidth()<=report.getPageWidth());assertTrue(e.getY()+e.getHeight()<=report.getPageHeight());
   if(e instanceof JRPrintText text)texts.append(text.getFullText());
  }
  assertTrue(texts.toString().contains("Manna aja!"));assertTrue(texts.toString().contains("Grand Total"));assertTrue(texts.toString().contains("29"));
 }
 @Test void workOrderUsesOnlyProductionFieldsEvenIfMoneyIsPresent() throws Exception{
  ObjectNode d=fixture();d.put("kind","work-order").put("deadline","01 Nov 2026, 09:00 WITA");JasperPrint r=new ReceiptRenderer().render(d);StringBuilder text=new StringBuilder();
  for(JRPrintElement e:r.getPages().get(0).getElements())if(e instanceof JRPrintText t)text.append(t.getFullText());
  assertTrue(text.toString().contains("WORK ORDER"));assertTrue(text.toString().contains("Kalender Dinding"));assertFalse(text.toString().contains("Rp"));assertFalse(text.toString().contains("Cashier"));assertFalse(text.toString().contains("Grand Total"));
 }
 @Test void protocolAcceptsOnlyFixedSchemeAndOpaqueCapability(){
  String t="a".repeat(43);assertEquals(t,Main.token("mannaprint://open?job="+t));
  for(String bad:new String[]{"https://evil.test", "mannaprint://open?job="+t+"&url=https://evil.test", "mannaprint://open?job=short", "mannaprint://open?job="+t+"\" --self-test x"})assertThrows(IllegalArgumentException.class,()->Main.token(bad));
 }
}
