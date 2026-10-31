$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$answer = [System.Windows.Forms.MessageBox]::Show('Hapus Manna Print Helper dari akun Windows ini? Tutup seluruh JasperViewer terlebih dahulu.','Manna Print Helper','YesNo','Question')
if ($answer -eq 'Yes') {
    Remove-Item 'HKCU:\Software\Classes\mannaprint' -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $env:LOCALAPPDATA 'MannaPrintHelper\app') -Recurse -Force
    [System.Windows.Forms.MessageBox]::Show('Manna Print Helper sudah dihapus.','Manna Print Helper') | Out-Null
}
