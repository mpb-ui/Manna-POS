package id.manna.print;

import com.fasterxml.jackson.databind.*;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.nio.channels.FileLock;
import java.time.Duration;
import javax.swing.*;
import net.sf.jasperreports.engine.*;
import net.sf.jasperreports.engine.util.JRSaver;
import net.sf.jasperreports.view.JasperViewer;

/** On-demand native protocol handler. No inbound port or persistent service. */
public final class Main {
    static final String ORIGIN="https://manna-pos.onrender.com";
    static final ObjectMapper JSON=new ObjectMapper();
    static IllegalArgumentException invalid(String code){
        return new IllegalArgumentException("Permintaan cetak tidak dikenali oleh Manna Print Helper 1.0.1 ("+code+"). Tutup jendela ini, lalu klik cetak kembali dari POS.");
    }
    static String token(String input){
        if(input==null||input.length()>512||input.chars().anyMatch(Character::isISOControl))throw invalid("URI_FORMAT");
        final URI uri;
        try{uri=new URI(input);}catch(URISyntaxException error){throw invalid("URI_FORMAT");}
        if(!"mannaprint".equalsIgnoreCase(uri.getScheme()))throw invalid("URI_SCHEME");
        if(uri.isOpaque()||!"open".equalsIgnoreCase(uri.getRawAuthority())||uri.getRawFragment()!=null)throw invalid("URI_TARGET");
        // Windows/browser launchers may canonicalize an empty authority path to /.
        if(!"".equals(uri.getRawPath())&&!"/".equals(uri.getRawPath()))throw invalid("URI_PATH");
        String query=uri.getRawQuery();
        if(query==null||query.indexOf('&')>=0)throw invalid("URI_QUERY");
        int separator=query.indexOf('=');
        if(separator<0)throw invalid("URI_QUERY");
        final String name,value;
        try{
            name=URLDecoder.decode(query.substring(0,separator),java.nio.charset.StandardCharsets.UTF_8);
            value=URLDecoder.decode(query.substring(separator+1),java.nio.charset.StandardCharsets.UTF_8);
        }catch(IllegalArgumentException error){throw invalid("URI_ENCODING");}
        if(!name.equals("job")||!value.matches("[A-Za-z0-9_-]{43}"))throw invalid("URI_CAPABILITY");
        return value;
    }
    static JsonNode request(String path,String token,String body) throws Exception{
        HttpClient client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).followRedirects(HttpClient.Redirect.NEVER).build();
        HttpRequest request=HttpRequest.newBuilder(URI.create(ORIGIN+path)).timeout(Duration.ofSeconds(30)).header("Authorization","Bearer "+token).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(body)).build();
        HttpResponse<java.io.InputStream> response=client.send(request,HttpResponse.BodyHandlers.ofInputStream());
        byte[] bytes;try(var stream=response.body()){bytes=stream.readNBytes(600001);}
        if(bytes.length>600000)throw new java.io.IOException("Dokumen terlalu besar");
        JsonNode json=JSON.readTree(bytes);
        if(response.statusCode()!=200)throw new java.io.IOException(json.path("error").asText("Tidak dapat mengambil dokumen. Klik cetak kembali dari POS."));
        return json;
    }
    private static Path directory() throws Exception{
        String local=System.getenv("LOCALAPPDATA");Path dir=Path.of(local==null?System.getProperty("user.home"):local,"MannaPrintHelper","documents");Files.createDirectories(dir);
        // Keep native receipts briefly; SQL/passwords and browser cookies never enter this directory.
        try(var files=Files.list(dir)){for(Path p:files.toList())if(Files.isRegularFile(p)&&Files.getLastModifiedTime(p).toMillis()<System.currentTimeMillis()-24*3600000L)try{Files.deleteIfExists(p);}catch(java.io.IOException ignored){}}
        return dir;
    }
    public static void main(String[] args){
        String capability=null;
        try{
            if(args.length==3&&args[0].equals("--protocol-test")){
                // CI calls this through the registered Windows URI handler. The
                // output contains only a result code, never the opaque capability.
                Path out=Path.of(args[1]);Files.createDirectories(out.toAbsolutePath().getParent());
                try{token(args[2]);Files.writeString(out,"accepted");System.exit(0);}
                catch(IllegalArgumentException rejected){Files.writeString(out,"rejected");System.exit(2);}
                return;
            }
            if(args.length==2&&args[0].equals("--self-test")){
                Path out=Path.of(args[1]);Files.createDirectories(out);
                JsonNode data=JSON.readTree("{\"schemaVersion\":1,\"kind\":\"work-order\",\"code\":\"SELF-TEST\",\"customerName\":\"Manna Print Helper\",\"date\":\"31 Okt 2026, 09:00 WITA\",\"deadline\":\"01 Nov 2026, 09:00 WITA\",\"phone\":\"1172\",\"items\":[{\"name\":\"Tes Work Order\",\"quantity\":\"2 pcs\",\"details\":[\"IBM Plex Sans × ²\"],\"note\":\"Dokumen pengujian\"}]}");
                JasperPrint report=new ReceiptRenderer().render(data);JRSaver.saveObject(report,out.resolve("self-test.jrprint").toFile());
                net.sf.jasperreports.engine.JasperExportManager.exportReportToPdfFile(report,out.resolve("self-test.pdf").toString());
                final JasperViewer[] window=new JasperViewer[1];
                SwingUtilities.invokeAndWait(()->{window[0]=new JasperViewer(report,false);window[0].setDefaultCloseOperation(JFrame.DISPOSE_ON_CLOSE);window[0].setSize(680,700);window[0].setLocationRelativeTo(null);window[0].setVisible(true);});
                Thread.sleep(500);
                javax.imageio.ImageIO.write(new java.awt.Robot().createScreenCapture(window[0].getBounds()),"png",out.resolve("self-test.png").toFile());
                SwingUtilities.invokeAndWait(()->window[0].dispose());Files.writeString(out.resolve("result.txt"),"JasperViewer opened successfully; report pages="+report.getPages().size());System.exit(0);return;
            }
            if(args.length==3&&args[0].equals("--render-test")){
                JasperPrint report=new ReceiptRenderer().render(JSON.readTree(Files.readString(Path.of(args[1]))));
                JRSaver.saveObject(report,args[2]+".jrprint");
                net.sf.jasperreports.engine.JasperExportManager.exportReportToPdfFile(report,args[2]+".pdf");return;
            }
            if(args.length!=1)throw invalid("ARG_COUNT_"+args.length);
            capability=token(args[0]);String currentToken=capability;
            Path dir=directory(),lockFile=dir.resolve(Integer.toHexString(capability.hashCode())+".lock");
            try(var channel=java.nio.channels.FileChannel.open(lockFile,StandardOpenOption.CREATE,StandardOpenOption.WRITE);FileLock lock=channel.tryLock()){
                if(lock==null)return;
                JsonNode data=request("/print-helper/claim",capability,"{}").path("document");
                JasperPrint report=new ReceiptRenderer().render(data);
                String name=data.path("code").asText("Nota").replaceAll("[^A-Za-z0-9_-]","_")+"-"+java.util.UUID.randomUUID();
                Path document=dir.resolve(name+".jrprint");JRSaver.saveObject(report,document.toFile());
                UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
                SwingUtilities.invokeAndWait(()->{
                    JasperViewer viewer=new JasperViewer(report,false);viewer.setTitle("JasperViewer · Manna Print · "+data.path("code").asText());viewer.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);viewer.setSize(780,860);viewer.setLocationRelativeTo(null);viewer.setZoomRatio(1.25f);viewer.setVisible(true);
                });
                try{request("/print-helper/status",currentToken,"{\"status\":\"opened\"}");}catch(Exception ignored){/* Native preview remains usable if acknowledgement cannot reach server. */}
            }
        }catch(Exception error){
            if(capability!=null)try{request("/print-helper/status",capability,"{\"status\":\"failed\"}");}catch(Exception ignored){}
            String message=error.getMessage();if(message==null||message.length()>400)message="Dokumen tidak dapat dibuka. Tutup dan klik cetak kembali dari Manna POS.";
            String display=message;SwingUtilities.invokeLater(()->{JOptionPane.showMessageDialog(null,display,"Manna Print Helper",JOptionPane.ERROR_MESSAGE);System.exit(1);});
        }
    }
}
