$text = Get-Content C:\ProMatrix.2\ai-voice-live-realtime\projects\llm-common\src\lib\live-interface.service.ts
$open = 0; $close = 0; $classStarted = $false

for ($i=0; $i -lt $text.Count; $i++) {
    $line = $text[$i]
    if ($line -match "export class LiveInterfaceService") {
        $classStarted = $true
    }
    if ($classStarted) {
        $open += ($line | Select-String "\{" -AllMatches).Count
        $close += ($line | Select-String "\}" -AllMatches).Count

        if ($open -gt 0 -and $open -eq $close) {
            Write-Output "Class ended at line $($i+1)"
            break
        }
    }
}
Write-Output "Total Final: Open=$open, Close=$close"