package id.manna.print;

import com.fasterxml.jackson.databind.JsonNode;
import java.awt.*;
import java.awt.font.FontRenderContext;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.*;
import java.util.*;
import java.util.List;
import javax.imageio.ImageIO;
import net.sf.jasperreports.engine.*;
import net.sf.jasperreports.engine.base.*;
import net.sf.jasperreports.engine.type.*;
import net.sf.jasperreports.renderers.SimpleDataRenderer;

/** A single 80 mm JasperPrint page. Its height is measured from actual content. */
public final class ReceiptRenderer {
    static final int PAGE_WIDTH=227, LEFT=11, WIDTH=204, MAX_HEIGHT=14000;
    private final JasperPrint report=new JasperPrint();
    private final JRBasePrintPage page=new JRBasePrintPage();
    private final Map<String,Font> fonts=new HashMap<>();
    private final FontRenderContext frc=new FontRenderContext(new AffineTransform(),true,true);
    private int y=11;
    public ReceiptRenderer() throws Exception {
        for(String weight:List.of("Regular","SemiBold","Bold","Italic")) {
            try(InputStream in=getClass().getResourceAsStream("/fonts/IBMPlexSans-"+weight+".ttf")) {
                if(in==null)throw new IOException("Font IBM Plex Sans tidak tersedia");
                Font f=Font.createFont(Font.TRUETYPE_FONT,in);fonts.put(weight,f);
                GraphicsEnvironment.getLocalGraphicsEnvironment().registerFont(f);
            }
        }
        report.setPageWidth(PAGE_WIDTH);report.setLeftMargin(LEFT);report.setRightMargin(12);report.setTopMargin(11);report.setBottomMargin(11);
        report.addPage(page);
    }
    private static String value(JsonNode node,String key){return node.path(key).asText("");}
    private Font font(String weight,float size){return fonts.get(weight).deriveFont(size);}
    private double width(String text,String weight,float size){return font(weight,size).getStringBounds(text,frc).getWidth();}
    List<String> wrap(String input,int maxWidth,String weight,float size){
        List<String> result=new ArrayList<>();
        for(String para:input.replace("\r","").split("\n",-1)){
            if(para.isEmpty()){result.add("");continue;}
            String line="";
            for(String word:para.replace('\u00a0',' ').split(" +")){
                String candidate=line.isEmpty()?word:line+" "+word;
                if(width(candidate,weight,size)<=maxWidth-1){line=candidate;continue;}
                if(!line.isEmpty()){result.add(line);line="";}
                for(int cp:word.codePoints().toArray()){
                    String c=new String(Character.toChars(cp));
                    if(!line.isEmpty()&&width(line+c,weight,size)>maxWidth-1){result.add(line);line="";}
                    line+=c;
                }
            }
            result.add(line);
        }
        return result;
    }
    private int text(String content,int x,int top,int w,float size,String weight,HorizontalTextAlignEnum align,Color color){
        List<String> lines=wrap(content,w,weight,size);
        int height=(int)Math.ceil(lines.size()*size*1.45)+3;
        JRBasePrintText el=new JRBasePrintText(report.getDefaultStyleProvider());
        el.setX(x);el.setY(top);el.setWidth(w);el.setHeight(height);
        el.setFontName(weight.equals("SemiBold")?"IBM Plex Sans SemiBold":"IBM Plex Sans");
        el.setBold(weight.equals("Bold"));el.setItalic(weight.equals("Italic"));el.setFontSize(size);
        el.setText(String.join("\n",lines));el.setTextHeight(height);el.setLineSpacingFactor(1f);el.setLeadingOffset(0);
        el.setHorizontalTextAlign(align);el.setVerticalTextAlign(VerticalTextAlignEnum.TOP);el.setForecolor(color);el.setMarkup("none");
        page.addElement(el);return height;
    }
    private int text(String content,int x,int top,int w,float size,String weight){return text(content,x,top,w,size,weight,HorizontalTextAlignEnum.LEFT,Color.BLACK);}
    private void paragraph(String value,float size,String weight){if(!value.isEmpty())y+=text(value,LEFT,y,WIDTH,size,weight);}
    private void center(String value,float size,String weight){y+=text(value,LEFT,y,WIDTH,size,weight,HorizontalTextAlignEnum.CENTER,Color.BLACK);}
    private void line(boolean dashed){
        y+=5;JRBasePrintLine el=new JRBasePrintLine(report.getDefaultStyleProvider());el.setX(LEFT);el.setY(y);el.setWidth(WIDTH);el.setHeight(0);
        el.getLinePen().setLineWidth(.5f);if(dashed)el.getLinePen().setLineStyle(LineStyleEnum.DASHED);page.addElement(el);y+=7;
    }
    private void rect(int x,int top,int w,int h,boolean fill){
        JRBasePrintRectangle el=new JRBasePrintRectangle(report.getDefaultStyleProvider());el.setX(x);el.setY(top);el.setWidth(w);el.setHeight(h);el.setRadius(3);
        el.setMode(fill?ModeEnum.OPAQUE:ModeEnum.TRANSPARENT);el.setBackcolor(Color.BLACK);el.getLinePen().setLineWidth(.6f);page.addElement(el);
    }
    private void meta(String label,String value,boolean bold){
        int a=text(label,LEFT,y,55,9,"Regular");int b=text(value,LEFT+60,y,WIDTH-60,9,bold?"Bold":"Regular",HorizontalTextAlignEnum.RIGHT,Color.BLACK);y+=Math.max(a,b);
    }
    private void logo() throws Exception{
        BufferedImage image;try(InputStream in=getClass().getResourceAsStream("/manna-logo.png")){image=ImageIO.read(in);}
        BufferedImage black=new BufferedImage(image.getWidth(),image.getHeight(),BufferedImage.TYPE_INT_ARGB);
        for(int iy=0;iy<image.getHeight();iy++)for(int ix=0;ix<image.getWidth();ix++)black.setRGB(ix,iy,image.getRGB(ix,iy)&0xff000000);
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();ImageIO.write(black,"png",bytes);
        JRBasePrintImage el=new JRBasePrintImage(report.getDefaultStyleProvider());el.setX(LEFT+22);el.setY(y);el.setWidth(159);el.setHeight((int)Math.ceil(159d*image.getHeight()/image.getWidth()));el.setRenderer(SimpleDataRenderer.getInstance(bytes.toByteArray()));el.setScaleImage(ScaleImageEnum.RETAIN_SHAPE);page.addElement(el);y+=el.getHeight()+6;
    }
    private void warning(JsonNode data){String msg=value(data,"warning");if(!msg.isEmpty()){y+=3;center(msg,10,"Bold");y+=3;}}
    private void item(JsonNode item,boolean work){
        int h;
        if(work){
            h=Math.max(text(value(item,"quantity"),LEFT,y,38,9,"SemiBold"),text(value(item,"name"),LEFT+44,y,WIDTH-44,9,"SemiBold"));y+=h;
        }else{
            String price=value(item,"price");float size=9;
            while(width(price,"Regular",size)>65&&size>6)size-=.25f;
            h=Math.max(text(value(item,"name"),LEFT,y,88,9,"SemiBold"),Math.max(text(value(item,"quantity"),LEFT+92,y,39,9,"Regular",HorizontalTextAlignEnum.CENTER,Color.BLACK),text(price,LEFT+135,y,69,size,"Regular",HorizontalTextAlignEnum.RIGHT,Color.BLACK)));y+=h;
        }
        int x=work?LEFT+44:LEFT+8,w=work?WIDTH-44:WIDTH-8;
        for(JsonNode d:item.path("details"))y+=text(d.asText(),x,y,w,9,"Regular");
        String note=value(item,"note");if(!note.isEmpty())y+=text("Catatan: "+note,x,y,w,9,"Italic");
        y+=5;
    }
    private void row(JsonNode row){
        String label=value(row,"label"),val=value(row,"value");boolean grand=value(row,"style").equals("grand");
        float size=grand?11:9;String weight=grand?"Bold":"Regular";int valueWidth=(int)Math.min(100,Math.max(68,Math.ceil(width(val,weight,size))+2));
        int labelWidth=WIDTH-valueWidth-7,top=y;
        if(grand){int expected=Math.max(wrap(label,labelWidth-4,weight,size).size(),wrap(val,valueWidth-4,weight,size).size());rect(LEFT,top,WIDTH,(int)Math.ceil(expected*size*1.45)+8,true);top+=3;}
        int a=text(label,LEFT+(grand?4:0),top,labelWidth,size,weight,HorizontalTextAlignEnum.LEFT,grand?Color.WHITE:Color.BLACK);
        int b=text(val,LEFT+WIDTH-valueWidth-(grand?4:0),top,valueWidth,size,weight,HorizontalTextAlignEnum.RIGHT,grand?Color.WHITE:Color.BLACK);
        y=top+Math.max(a,b)+(grand?5:0);
    }
    public JasperPrint render(JsonNode data) throws Exception{
        if(data.path("schemaVersion").asInt()!=1)throw new IOException("Versi dokumen tidak didukung");
        if(!List.of("invoice","payment","work-order").contains(value(data,"kind")))throw new IOException("Jenis dokumen tidak didukung");
        boolean work=value(data,"kind").equals("work-order");report.setName(value(data,"code")+(work?"-WO":"-Nota"));
        if(work){
            int h=Math.max(text(value(data,"code"),LEFT,y,125,10,"Regular"),text("WORK ORDER",LEFT+130,y,74,9,"Regular",HorizontalTextAlignEnum.RIGHT,Color.BLACK));y+=h+4;
            paragraph(value(data,"customerName"),16,"Bold");warning(data);line(false);
            meta("Tgl Order",value(data,"date"),false);meta("Deadline",value(data,"deadline"),true);meta("Telp",value(data,"phone"),false);line(false);
        }else{
            logo();center(value(data,"shopName"),9,"SemiBold");center(value(data,"shopAddress"),7,"Regular");warning(data);line(false);
            meta("Nota",value(data,"code"),false);meta("Tanggal",value(data,"date"),false);meta("Telp",value(data,"phone"),false);meta("Customer",value(data,"customerName"),false);line(false);
        }
        boolean first=true;for(JsonNode item:data.path("items")){if(work&&!first)line(true);item(item,work);first=false;}
        if(!work){
            line(true);for(JsonNode row:data.path("rows"))row(row);
            for(JsonNode msg:data.path("messages"))paragraph(msg.asText(),8,"Regular");line(false);
            int boxTop=y,sequenceHeight=0;if(data.path("sequence").isNumber())sequenceHeight=text("Pembayaran ke: "+data.path("sequence").asInt(),LEFT+4,y+3,88,8,"Regular");
            int statusHeight=text(value(data,"status"),LEFT+4,y+sequenceHeight+3,88,11,"Bold");
            int cashHeight=text("Cashier: "+value(data,"cashier"),LEFT+99,y+3,WIDTH-99,8,"Regular",HorizontalTextAlignEnum.RIGHT,Color.BLACK);
            rect(LEFT,boxTop,96,sequenceHeight+statusHeight+6,false);y+=Math.max(cashHeight,sequenceHeight+statusHeight)+9;
            paragraph(value(data,"reference"),7,"Regular");y+=5;center(value(data,"footer"),8,"Regular");y+=5;center(value(data,"slogan"),9,"Bold");
        }
        if(y>MAX_HEIGHT)throw new IOException("Dokumen melebihi panjang yang didukung. Hubungi Owner.");
        report.setPageHeight(y+11);return report;
    }
}
