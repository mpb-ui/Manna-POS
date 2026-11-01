package id.manna.print;

import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.print.*;
import net.sf.jasperreports.engine.*;
import net.sf.jasperreports.engine.export.JRGraphics2DExporter;
import net.sf.jasperreports.export.*;

/** Fit the entire receipt to the selected driver's printable width, including its margins. */
final class ThermalPrinter {
    private ThermalPrinter() {}

    static void print(JasperPrint report) throws PrinterException {
        print(report, PrinterJob.getPrinterJob());
    }

    static void print(JasperPrint report, PrinterJob job) throws PrinterException {
        job.setJobName("Manna Print - " + report.getName());
        configure(report, job);
        if (!job.printDialog()) return;
        // The dialog can select a different printer. Validate against that driver
        // again; Jasper's default printer draws at physical 0,0 without this fit.
        configure(report, job);
        job.print(); // One submission only. Never retry a partially printed receipt.
    }

    private static void configure(JasperPrint report, PrinterJob job) throws PrinterException {
        Paper paper = new Paper();
        paper.setSize(report.getPageWidth(), report.getPageHeight());
        paper.setImageableArea(0, 0, report.getPageWidth(), report.getPageHeight());
        PageFormat requested = new PageFormat();
        requested.setOrientation(PageFormat.PORTRAIT);
        requested.setPaper(paper);
        job.setPageable(new RollPages(report, job.validatePage(requested)));
    }

    /** Jasper stays one measured page. A driver with a roll-length limit gets
     * consecutive slices, rather than losing the footer or repeating the header. */
    static final class RollPages implements Pageable, Printable {
        private final JasperPrint report;
        private final PageFormat format;
        final double scale;
        private final int count;

        RollPages(JasperPrint report, PageFormat format) throws PrinterException {
            if (report.getPages().size() != 1 || report.getPageWidth() <= 0 || report.getPageHeight() <= 0)
                throw new PrinterException("Dokumen struk tidak valid.");
            double width = format.getImageableWidth(), height = format.getImageableHeight();
            if (!Double.isFinite(width) || !Double.isFinite(height) || width <= 0 || height <= 0)
                throw new PrinterException("Area cetak printer tidak valid. Pilih driver dan kertas 80 mm.");
            this.report = report;
            this.format = (PageFormat) format.clone();
            scale = Math.min(1, width / report.getPageWidth());
            count = Math.max(1, (int) Math.ceil(report.getPageHeight() * scale / height));
        }

        @Override public int getNumberOfPages() { return count; }
        private void check(int index) {
            if (index < 0 || index >= count) throw new IndexOutOfBoundsException("Page " + index);
        }
        @Override public PageFormat getPageFormat(int index) { check(index); return (PageFormat) format.clone(); }
        @Override public Printable getPrintable(int index) { check(index); return this; }

        @Override public int print(Graphics graphics, PageFormat page, int index) throws PrinterException {
            if (index < 0 || index >= count) return NO_SUCH_PAGE;
            if (Thread.currentThread().isInterrupted()) throw new PrinterException("Pencetakan dibatalkan.");
            Graphics2D g = (Graphics2D) graphics.create();
            try {
                g.clip(new java.awt.geom.Rectangle2D.Double(page.getImageableX(), page.getImageableY(), page.getImageableWidth(), page.getImageableHeight()));
                g.translate(page.getImageableX() + (page.getImageableWidth() - report.getPageWidth() * scale) / 2,
                    page.getImageableY() - index * page.getImageableHeight());
                g.scale(scale, scale);
                JRGraphics2DExporter exporter = new JRGraphics2DExporter();
                exporter.setExporterInput(new SimpleExporterInput(report));
                SimpleGraphics2DExporterOutput output = new SimpleGraphics2DExporterOutput();
                output.setGraphics2D(g);
                exporter.setExporterOutput(output);
                SimpleGraphics2DReportConfiguration configuration = new SimpleGraphics2DReportConfiguration();
                configuration.setPageIndex(0);
                exporter.setConfiguration(configuration);
                exporter.exportReport();
                return PAGE_EXISTS;
            } catch (JRException error) {
                PrinterException failure = new PrinterException("Dokumen tidak dapat dicetak: " + error.getMessage());
                failure.initCause(error);
                throw failure;
            } finally { g.dispose(); }
        }
    }
}
