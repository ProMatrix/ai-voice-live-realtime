$files = @(
  "C:\ProMatrix.2\ai-voice-live-realtime\projects\host-azure-voice\src\styles.scss",
  "C:\ProMatrix.2\ai-voice-live-realtime\projects\host-gemini-voice\src\styles.scss"
)
foreach ($file in $files) {
  if (Test-Path $file) {
    # Prepend / for absolute resolution natively bypassing ESBuild packager.
    $content = Get-Content $file
    $content = $content -replace "url\('assets/", "url('/assets/"
    $content = $content -replace 'url\("assets/', 'url("/assets/'
    Set-Content -Path $file -Value $content
  }
}
Write-Output "Prepended '/' to css url() rules."