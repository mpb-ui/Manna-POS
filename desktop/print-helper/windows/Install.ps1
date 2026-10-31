param([switch]$Quiet)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
try {
    $source = Join-Path $PSScriptRoot 'MannaPrintHelper'
    $destination = Join-Path $env:LOCALAPPDATA 'MannaPrintHelper\app'
    if (-not (Test-Path (Join-Path $source 'MannaPrintHelper.exe'))) { throw 'Ekstrak seluruh isi ZIP terlebih dahulu, kemudian jalankan Install.cmd.' }
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    Copy-Item -Path (Join-Path $source '*') -Destination $destination -Recurse -Force
    $exe = Join-Path $destination 'MannaPrintHelper.exe'
    $protocol = 'HKCU:\Software\Classes\mannaprint'
    New-Item -Path "$protocol\shell\open\command" -Force | Out-Null
    Set-Item -Path $protocol -Value 'URL:Manna Print Helper'
    New-ItemProperty -Path $protocol -Name 'URL Protocol' -Value '' -Force | Out-Null
    Set-Item -Path "$protocol\shell\open\command" -Value ('"{0}" "%1"' -f $exe)
    New-Item -Path "$protocol\DefaultIcon" -Force | Out-Null
    Set-Item -Path "$protocol\DefaultIcon" -Value ('"{0}",0' -f $exe)
    $uninstall = Join-Path $env:LOCALAPPDATA 'MannaPrintHelper\Uninstall.ps1'
    Copy-Item (Join-Path $PSScriptRoot 'Uninstall.ps1') $uninstall -Force
    if (-not $Quiet) { [System.Windows.Forms.MessageBox]::Show('Manna Print Helper sudah terpasang. Buka Manna POS lalu klik Nota Ulang atau Print SPK. Izinkan browser membuka Manna Print Helper jika diminta.','Manna Print Helper','OK','Information') | Out-Null }
} catch {
    if (-not $Quiet) { [System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'Pemasangan belum selesai','OK','Error') | Out-Null }
    exit 1
}
