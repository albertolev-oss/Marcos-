$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
Set-Location $projectDir
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Se requiere Docker Desktop iniciado en esta PC.'
}
& docker compose -f docker-compose.institutional.yml up --build -d
if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar el navegador institucional.' }
Start-Process 'http://localhost:8082'
Start-Process 'http://localhost:8083'
Write-Host 'SIHOSP: http://localhost:8082 | PACS: http://localhost:8083'
Write-Host 'Inicia sesion manualmente, selecciona una pagina y pulsa Capturar pagina para lectura.'
