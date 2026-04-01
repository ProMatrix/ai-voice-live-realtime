$files = @(
  "C:\ProMatrix.2\ai-voice-live-realtime\projects\host-azure-voice\src\app\app.html",
  "C:\ProMatrix.2\ai-voice-live-realtime\projects\host-azure-voice\src\styles.scss",
  "C:\ProMatrix.2\ai-voice-live-realtime\projects\host-gemini-voice\src\app\app.html",
  "C:\ProMatrix.2\ai-voice-live-realtime\projects\host-gemini-voice\src\styles.scss"
)
foreach ($file in $files) {
  if (Test-Path $file) {
    # Replace "img/" with "assets/img/"
    $content = Get-Content $file
    $content = $content -replace '"img/', '"assets/img/'
    $content = $content -replace "'img/", "'assets/img/"
    
    # Replace "fonts/" with "assets/fonts/" inside url()
    $content = $content -replace "url\('fonts/", "url('assets/fonts/"
    $content = $content -replace 'url\("fonts/', 'url("assets/fonts/'
    
    Set-Content -Path $file -Value $content
  }
}
Write-Output "Renamed paths to use 'assets/' directly."