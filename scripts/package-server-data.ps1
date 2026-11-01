$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDirectory = $env:TEMP
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$archivePath = Join-Path $outputDirectory "whatsapp-data-transfer-$timestamp.zip"
$candidatePaths = @(
  'whatsapp_auth',
  'whatsapp_media',
  'whatsapp_avatars',
  'app_data',
  'public/uploads',
  'public/media',
  'public/avatars'
)
$includedPaths = @($candidatePaths | Where-Object { Test-Path -LiteralPath (Join-Path $projectRoot $_) } | ForEach-Object { Join-Path $projectRoot $_ })

if ($includedPaths.Count -eq 0) {
  throw 'No application data directories were found.'
}

Compress-Archive -LiteralPath $includedPaths -DestinationPath $archivePath -CompressionLevel Optimal

Write-Output "Prepared private data archive: $archivePath"
Write-Output 'Copy it to the persistent DATA_DIR on the server and extract it there. Do not commit it to Git.'
