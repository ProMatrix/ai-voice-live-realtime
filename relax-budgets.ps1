$content = Get-Content C:\ProMatrix.2\ai-voice-live-realtime\angular.json
$content = $content -replace '"maximumError": "8kb"', '"maximumError": "2gb"'
$content = $content -replace '"maximumError": "4kb"', '"maximumError": "2gb"'
$content = $content -replace '"maximumWarning": "4kb"', '"maximumWarning": "2gb"'
$content = $content -replace '"maximumWarning": "2kb"', '"maximumWarning": "2gb"'
Set-Content -Path C:\ProMatrix.2\ai-voice-live-realtime\angular.json -Value $content
Write-Output "Relaxed angular budget sizes."