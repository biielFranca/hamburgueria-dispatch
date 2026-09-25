# Verifica que as Edge Functions recusam chamadas sem autenticação.
# Uso (PowerShell): .\scripts\verify-edge-auth.ps1
# Esperado: todas as linhas com OK.

$base = "https://cuvhtdtkuwewslozddfw.supabase.co/functions/v1"
$fakeStore = "00000000-0000-0000-0000-000000000000"

function Check($name, $url, $body, $expectCode, $expectText) {
  $out  = New-TemporaryFile
  $code = curl.exe -s -o $out -w "%{http_code}" -X POST $url -H "Content-Type: application/json" -d $body
  $text = Get-Content $out -Raw
  Remove-Item $out
  $ok = ($code -eq $expectCode) -and (-not $expectText -or $text -like "*$expectText*")
  $status = if ($ok) { "OK  " } else { "FALHOU" }
  Write-Output "$status $name -> HTTP $code $text"
}

Check "ifood-sync sem token"              "$base/ifood-sync"                     '{}'                                            "401" $null
Check "open-delivery-sync sem token"      "$base/open-delivery-sync"             '{\"platform\":\"keeta\"}'                       "401" $null
Check "dispatch-confirm sem token"        "$base/open-delivery-dispatch-confirm" '{\"platform\":\"keeta\",\"platformOrderId\":\"x\"}' "401" $null
Check "classify-orders sem token"         "$base/classify-orders"                '{}'                                            "401" $null
Check "run-route-engine sem token"        "$base/run-route-engine"               '{}'                                            "401" $null
Check "compute-alert-state sem service"   "$base/compute-alert-state"            '{}'                                            "401" $null
# Versão antiga aceitava webhook sem assinatura e respondia "ok":true.
# Versão nova recusa antes de processar: "ok":false.
Check "webhook sem assinatura"            "$base/open-delivery-webhook?platform=keeta&storeId=$fakeStore" '{}' "200" '"ok":false'
