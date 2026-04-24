# Gera uma pasta SO com o backend (server/) para git init e push a um repo NOVO no GitHub.
# Uso na raiz do projeto: npm run publish:backend
#   .\scripts\publish-backend.ps1 -OutputPath "D:\repos\meu-vault-api"

param(
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$ServerSrc = Join-Path $ProjectRoot "server"

if (-not (Test-Path $ServerSrc)) {
  throw "Pasta server/ nao encontrada: $ProjectRoot"
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path (Split-Path $ProjectRoot -Parent) "vault-api-backend-only"
}

Write-Host "Origem:  $ServerSrc"
Write-Host "Destino: $OutputPath"
Write-Host ""

if (Test-Path $OutputPath) {
  Remove-Item -LiteralPath $OutputPath -Recurse -Force
}
New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null

Get-ChildItem -LiteralPath $ServerSrc -Force | ForEach-Object {
  if ($_.Name -eq "node_modules") { return }
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $OutputPath $_.Name) -Recurse -Force
}

$gitignorePath = Join-Path $OutputPath ".gitignore"
Set-Content -LiteralPath $gitignorePath -Encoding utf8 -Value @(
  "node_modules/"
  ".env"
  "*.log"
)

Set-Location $OutputPath

if (Test-Path ".git") {
  Write-Host "Ja existe .git aqui - apaga a pasta se quiseres recomecar."
}
else {
  git init
  git branch -M main
  git add .
  git commit -m "vault-api backend only"
}

Write-Host ""
Write-Host "=== PRONTO ==="
Write-Host "1. Cria um repo VAZIO no GitHub (sem README)."
Write-Host "2. cd para:"
Write-Host "   $OutputPath"
Write-Host "3. git remote add origin https://github.com/TEU_USER/vault-api.git"
Write-Host "4. git push -u origin main"
Write-Host ""
Write-Host "Na VPS: git clone desse repo, cd + npm install + BIND_HOST=0.0.0.0 — ver BACKEND.md"
