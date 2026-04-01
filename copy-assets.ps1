$srcs = @('assets', 'img', 'favicon.ico')
foreach ($src in $srcs) {
  if (Test-Path "C:\ProMatrix.2\azure-voice-live\src\$src") {
    Copy-Item -Path "C:\ProMatrix.2\azure-voice-live\src\$src" -Destination "C:\ProMatrix.2\ai-voice-live-realtime\projects\host-azure-voice\public" -Recurse -Force
  }
}
foreach ($src in $srcs) {
  if (Test-Path "C:\ProMatrix.2\ai-realtime-framework\src\$src") {
    Copy-Item -Path "C:\ProMatrix.2\ai-realtime-framework\src\$src" -Destination "C:\ProMatrix.2\ai-voice-live-realtime\projects\host-gemini-voice\public" -Recurse -Force
  }
}
Write-Output "Copied successfully."