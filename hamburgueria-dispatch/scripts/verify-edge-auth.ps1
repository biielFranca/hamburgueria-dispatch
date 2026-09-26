# Verifica que as Edge Functions recusam chamadas sem autenticação.
# Uso (PowerShell 5 ou 7): .\scripts\verify-edge-auth.ps1
# Esperado: todas as linhas com OK.

$base = "https://cuvhtdtkuwewslozddfw.supabase.co/functions/v1"

function Check($name, $url, $body, $expectCode, $expectText) {
  # Body vai por arquivo (--data-binary @arquivo) para não depender de como
  # cada versão do PowerShell repassa aspas para programas externos.
  $bodyFile = New-TemporaryFile
  $outFile  = New-TemporaryFile
  [IO.File]::WriteAllText($bodyFile, $body)
  $code = curl.exe -s -o $outFile -w "%{http_code}" -X POST $url -H "Content-Type: application/json" --data-binary "@$bodyFile"
  $text = Get-Content $outFile -Raw
  Remove-Item $bodyFile, $outFile
  $ok = ($code -eq $expectCode) -and (-not $expectText -or $text -like "*$expectText*")
  $status = if ($ok) { "OK    " } else { "FALHOU" }
  Write-Output "$status $name -> HTTP $code $text"
}

Check "ifood-sync sem token"            "$base/ifood-sync"                     '{}'                                           "401" $null
Check "open-delivery-sync sem token"    "$base/open-delivery-sync"             '{"platform":"keeta"}'                         "401" $null
Check "dispatch-confirm sem token"      "$base/open-delivery-dispatch-confirm" '{"platform":"keeta","platformOrderId":"x"}'   "401" $null
Check "classify-orders sem token"       "$base/classify-orders"                '{}'                                           "401" $null
Check "run-route-engine sem token"      "$base/run-route-engine"               '{}'                                           "401" $null
Check "ifood-webhook sem assinatura"    "$base/ifood-webhook"                  '{"code":"KEEPALIVE"}'                         "401" $null
Check "food99-webhook sem assinatura"   "$base/food99-webhook"                 '{"type":"orderNew"}'                          "401" $null
Check "keeta-webhook sem assinatura"    "$base/keeta-webhook/v1/newEvent"      '{"eventType":"CREATED"}'                      "401" $null
