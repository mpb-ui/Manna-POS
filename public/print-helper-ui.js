export function createPrintHelperUI({api,identity,toast,launch=url=>{window.location.href=url;}}){
  let busy=false,active=null,generation=0;
  const reset=()=>{generation++;active?.close();active=null;busy=false;};
  async function open({orderId,kind,paymentId,browserPrint}){
    if(busy){toast('Tunggu permintaan cetak sebelumnya selesai.');return;}
    busy=true;const user=identity(),token=++generation;let timer,job;
    const valid=()=>token===generation&&identity()===user&&d.isConnected&&d.open;
    const d=document.createElement('dialog');d.className='print-helper-dialog';
    d.innerHTML='<div class="detail-head"><div><span class="order-code">CETAK DOKUMEN</span><h2>Membuka JasperViewer</h2></div><button type="button" class="detail-close" aria-label="Tutup">×</button></div><div class="detail-body"><p data-print-message role="status">Menyiapkan dokumen…</p><div class="print-helper-install"><strong>Pemasangan pertama</strong><p>Unduh program, ekstrak ZIP, lalu jalankan Install.cmd di komputer kasir Windows. Setelah terpasang, klik Buka JasperViewer.</p><a data-print-download class="secondary" target="_blank" rel="noopener" hidden>Unduh Manna Print Helper</a></div></div><div class="detail-actions"><button type="button" class="secondary" data-print-browser>Cetak melalui browser</button><button type="button" class="primary" data-print-open disabled>Buka JasperViewer</button></div>';
    document.body.append(d);active=d;
    const message=text=>{d.querySelector('[data-print-message]').textContent=text;};
    const cleanup=()=>{clearTimeout(timer);d.remove();if(active===d)active=null;if(token===generation)busy=false;};
    d.addEventListener('close',cleanup,{once:true});d.querySelector('.detail-close').onclick=()=>d.close();
    d.querySelector('[data-print-browser]').onclick=async()=>{const allowed=token===generation&&identity()===user;d.close();if(allowed)await browserPrint();};
    d.showModal();
    const invoke=()=>{
      if(!valid()||!job)return;
      try{launch(job.launchUrl);message('Permintaan dikirim. Izinkan browser membuka Manna Print Helper jika muncul konfirmasi.');}
      catch{message('Browser belum dapat membuka helper. Pasang program, lalu klik Buka JasperViewer.');}
    };
    try{
      job=await api('/api/print-jobs',{method:'POST',body:JSON.stringify({orderId,kind,...paymentId?{paymentId}:{}})});
      if(!valid()){d.close();return;}
      const download=d.querySelector('[data-print-download]');download.href=job.downloadUrl;download.hidden=false;
      d.querySelector('[data-print-open]').disabled=false;
      d.querySelector('[data-print-open]').onclick=invoke;
      invoke();let attempts=0;
      const poll=async()=>{
        if(!valid()||!d.open)return;
        try{
          const status=await api('/api/print-jobs/'+encodeURIComponent(job.id));
          if(!valid()||!d.open)return;
          if(status.status==='received'){message('Dokumen diterima. JasperViewer sedang disiapkan…');d.querySelector('[data-print-open]').disabled=true;}
          if(status.status==='opened'){toast('Dokumen dibuka di JasperViewer.');d.close();return;}
          if(status.status==='failed'){message('Helper gagal menyusun dokumen. Lihat pesan di komputer kasir, lalu tutup dan coba cetak kembali.');d.querySelector('[data-print-open]').disabled=true;return;}
          if(++attempts===12&&status.status==='waiting')message('Helper belum membuka dokumen. Pastikan sudah terpasang dan izinkan browser membuka aplikasi.');
          if(attempts<90)timer=setTimeout(poll,1000);
          else{message('Permintaan cetak kedaluwarsa. Tutup jendela ini, lalu klik cetak kembali.');d.querySelector('[data-print-open]').disabled=true;}
        }catch(error){if(valid()&&d.open){message(error.message);d.querySelector('[data-print-open]').disabled=true;}}
      };timer=setTimeout(poll,1000);
    }catch(error){if(valid())message(error.message);}
  }
  return {open,reset};
}
