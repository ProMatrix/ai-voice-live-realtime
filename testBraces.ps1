$text = Get-Content C:\ProMatrix.2\ai-voice-live-realtime\projects\llm-common\src\lib\live-interface.service.ts
$open = 0; $close = 0

for ($i=0; $i -lt $text.Count; $i++) {
    $line = $text[$i]
    $open += ($line | Select-String "\{" -AllMatches).Count
    $close += ($line | Select-String "\}" -AllMatches).Count

    if ($open -gt 0 -and $open -eq $close) {
        Write-Output "Class potentially closed at line $($i+1)"
    }
}
Write-Output "Total Final: Open=$open, Close=$close"
