param(
  [string]$ProjectRef = "cuvhtdtkuwewslozddfw"
)

if (-not $env:SUPABASE_ACCESS_TOKEN) {
  Write-Error "SUPABASE_ACCESS_TOKEN não definido. Defina um token sbp_... antes do deploy."
  exit 1
}

$functions = @(
  "open-delivery-sync",
  "open-delivery-webhook",
  "open-delivery-dispatch-confirm"
)

foreach ($fn in $functions) {
  Write-Host "Deploying $fn..." -ForegroundColor Cyan
  npx.cmd --yes supabase functions deploy $fn `
    --project-ref $ProjectRef `
    --use-api `
    --no-verify-jwt

  if ($LASTEXITCODE -ne 0) {
    Write-Error "Falha ao deployar $fn."
    exit $LASTEXITCODE
  }
}

Write-Host "Deploy concluído." -ForegroundColor Green
npx.cmd --yes supabase functions list --project-ref $ProjectRef --output pretty
