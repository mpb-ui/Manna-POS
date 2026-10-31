// Fonts and the supplied logo must finish loading before Chrome opens print.
export async function prepareThermalPrint(element, fonts = document.fonts) {
  const sample = 'Manna 0123456789 Rp × ²';
  const loaded = await Promise.all([...['400','600','700'].map(weight => fonts.load(`${weight} 12px "IBM Plex Sans"`,sample)),fonts.load('italic 400 12px "IBM Plex Sans"',sample)]);
  await fonts.ready;
  if (loaded.some(faces=>!faces.length) || !['400','600','700'].every(weight=>fonts.check(`${weight} 12px "IBM Plex Sans"`,sample)) || !fonts.check('italic 400 12px "IBM Plex Sans"',sample)) throw new Error('Font struk belum berhasil dimuat. Silakan coba cetak kembali.');
  await Promise.all([...element.querySelectorAll('img')].map(async img => {
    await img.decode();
    if (!img.naturalWidth) throw new Error('Logo struk belum berhasil dimuat. Silakan coba cetak kembali.');
  }));
}
