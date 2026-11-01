package id.manna.print;

import javax.swing.*;
import net.sf.jasperreports.engine.JasperPrint;
import net.sf.jasperreports.swing.*;

/** Official Jasper viewer and toolbar, with driver-aware thermal printing. */
final class ThermalViewer extends JFrame {
    ThermalViewer(JasperPrint report) {
        super("JasperViewer · Manna Print · " + report.getName());
        JRViewer viewer = new JRViewer(report) {
            @Override protected JRViewerToolbar createToolbar() {
                return new JRViewerToolbar(viewerContext) {
                    {
                        // Use the protected toolbar extension point, not component
                        // positions or translated tooltip text, to replace Print.
                        for (var listener : btnPrint.getActionListeners()) btnPrint.removeActionListener(listener);
                        btnPrint.addActionListener(event -> {
                            btnPrint.setEnabled(false);
                            JasperPrint current = viewerContext.getJasperPrint();
                            new SwingWorker<Void, Void>() {
                                @Override protected Void doInBackground() throws Exception {
                                    ThermalPrinter.print(current);
                                    return null;
                                }
                                @Override protected void done() {
                                    try { get(); }
                                    catch (Exception error) {
                                        Throwable cause = error.getCause() == null ? error : error.getCause();
                                        JOptionPane.showMessageDialog(ThermalViewer.this,
                                            cause.getMessage(), "Manna Print Helper", JOptionPane.ERROR_MESSAGE);
                                    } finally { btnPrint.setEnabled(true); }
                                }
                            }.execute();
                        });
                    }
                };
            }
        };
        viewer.setZoomRatio(1.25f);
        setContentPane(viewer);
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setSize(780, 860);
        setLocationRelativeTo(null);
    }
}
