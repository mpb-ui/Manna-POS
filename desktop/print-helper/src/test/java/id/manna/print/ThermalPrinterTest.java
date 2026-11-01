package id.manna.print;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.awt.print.*;
import net.sf.jasperreports.engine.*;
import net.sf.jasperreports.engine.base.*;
import net.sf.jasperreports.engine.type.ModeEnum;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ThermalPrinterTest {
    static PageFormat paper(double width, double height, double left, double top, double printableWidth, double printableHeight) {
        Paper p=new Paper();p.setSize(width,height);p.setImageableArea(left,top,printableWidth,printableHeight);
        PageFormat f=new PageFormat();f.setPaper(p);return f;
    }
    static JasperPrint markers(int height) {
        JasperPrint r=new JasperPrint();r.setName("test");r.setPageWidth(227);r.setPageHeight(height);
        JRBasePrintPage p=new JRBasePrintPage();r.addPage(p);
        for(int y:new int[]{11,height-21})for(int x:new int[]{11,205}){
            JRBasePrintRectangle el=new JRBasePrintRectangle(r.getDefaultStyleProvider());
            el.setX(x);el.setY(y);el.setWidth(10);el.setHeight(10);el.setMode(ModeEnum.OPAQUE);
            el.setBackcolor(Color.BLACK);el.getLinePen().setLineWidth(0f);p.addElement(el);
        }
        return r;
    }
    static BufferedImage render(ThermalPrinter.RollPages pages,int index) throws Exception {
        PageFormat f=pages.getPageFormat(index);BufferedImage image=new BufferedImage((int)Math.ceil(f.getWidth()),(int)Math.ceil(f.getHeight()),BufferedImage.TYPE_INT_RGB);
        Graphics2D g=image.createGraphics();g.setColor(Color.WHITE);g.fillRect(0,0,image.getWidth(),image.getHeight());
        assertEquals(Printable.PAGE_EXISTS,pages.print(g,f,index));g.dispose();return image;
    }
    static int ink(BufferedImage image,int left,int top,int right,int bottom) {
        int count=0;for(int y=top;y<bottom;y++)for(int x=left;x<right;x++)if((image.getRGB(x,y)&0xffffff)!=0xffffff)count++;
        return count;
    }
    @Test void bothEdgesAndFooterFitNarrowDriverWithNonzeroMargins() throws Exception {
        for(int printableWidth:new int[]{204,190,183}){
            JasperPrint report=markers(400);
            PageFormat f=paper(227,400,17,9,printableWidth,382);
            var pages=new ThermalPrinter.RollPages(report,f);assertEquals(1,pages.getNumberOfPages());
            assertEquals(printableWidth/227d,pages.scale,.00001);
            BufferedImage image=render(pages,0);
            int ink=ink(image,0,0,image.getWidth(),image.getHeight());assertTrue(ink>100);
            assertEquals(ink,ink(image,17,9,17+printableWidth,391),"All ink stays inside the driver's printable area");
            int right=17+(int)(215*pages.scale),bottom=9+(int)(389*pages.scale);
            assertTrue(ink(image,right-8,bottom-8,right+1,bottom+1)>20,"Bottom-right marker must survive");
        }
    }
    @Test void widePaperNeverEnlargesThermalReceipt() throws Exception {
        var pages=new ThermalPrinter.RollPages(markers(400),paper(595,842,36,36,523,770));
        assertEquals(1,pages.scale);assertEquals(1,pages.getNumberOfPages());
        assertEquals(Printable.NO_SUCH_PAGE,pages.print(new BufferedImage(1,1,1).getGraphics(),pages.getPageFormat(0),-1));
        assertThrows(IndexOutOfBoundsException.class,()->pages.getPageFormat(1));
    }
    @Test void driverLengthLimitContinuesFooterWithoutRepeatingHeader() throws Exception {
        var pages=new ThermalPrinter.RollPages(markers(600),paper(227,220,11,10,204,200));
        assertEquals(3,pages.getNumberOfPages());
        BufferedImage first=render(pages,0),middle=render(pages,1),last=render(pages,2);
        assertTrue(ink(first,0,0,227,220)>40);
        assertEquals(0,ink(middle,0,0,227,220)); // no header replay in continuation
        assertTrue(ink(last,0,0,227,220)>40); // last footer markers included
        assertEquals(Printable.NO_SUCH_PAGE,pages.print(last.getGraphics(),pages.getPageFormat(0),3));
    }
    @Test void invalidImageableAreaFailsBeforeSending() {
        assertThrows(PrinterException.class,()->new ThermalPrinter.RollPages(markers(400),paper(227,400,0,0,0,400)));
        assertThrows(PrinterException.class,()->new ThermalPrinter.RollPages(markers(400),paper(227,400,0,0,204,0)));
    }

    static final class Driver extends PrinterJob {
        int validations,submissions,copies=1;boolean accepted=true,fail=false;Pageable pages;
        @Override public void setPageable(Pageable p){pages=p;}
        @Override public PageFormat validatePage(PageFormat requested){
            validations++;assertEquals(227,requested.getWidth());assertEquals(400,requested.getHeight());
            return paper(227,400,17,9,validations==1?204:183,382);
        }
        @Override public boolean printDialog(){assertNotNull(pages);setCopies(2);return accepted;}
        @Override public void print() throws PrinterException {submissions++;assertEquals(183/227d,((ThermalPrinter.RollPages)pages).scale,.00001);if(fail)throw new PrinterException("test error");}
        @Override public void setCopies(int copies){this.copies=copies;}
        @Override public int getCopies(){return copies;}
        @Override public void setJobName(String name){}
        @Override public String getJobName(){return "test";}
        @Override public String getUserName(){return "test";}
        @Override public void cancel(){}
        @Override public boolean isCancelled(){return false;}
        @Override public void setPrintable(Printable p){}
        @Override public void setPrintable(Printable p,PageFormat f){}
        @Override public PageFormat pageDialog(PageFormat f){return f;}
        @Override public PageFormat defaultPage(PageFormat f){return f;}
    }
    @Test void changingPrinterInDialogRevalidatesOnceAndPreservesCopies() throws Exception {
        Driver job=new Driver();ThermalPrinter.print(markers(400),job);
        assertEquals(2,job.validations);assertEquals(1,job.submissions);assertEquals(2,job.getCopies());
    }
    @Test void cancellingSendsNothingAndFailureNeverRetries() throws Exception {
        Driver cancelled=new Driver();cancelled.accepted=false;ThermalPrinter.print(markers(400),cancelled);
        assertEquals(0,cancelled.submissions);assertEquals(1,cancelled.validations);
        Driver broken=new Driver();broken.fail=true;assertThrows(PrinterException.class,()->ThermalPrinter.print(markers(400),broken));assertEquals(1,broken.submissions);
    }
}
