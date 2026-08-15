$ErrorActionPreference = 'Stop'

$remove = @(
  'src\lib\telephony\config.ts',
  'src\app\api\telephony\voice\outbound',
  'src\app\api\telephony\voice\inbound\telnyx',
  'src\app\api\telephony\voice\inbound\plivo',
  'cloud-dialer-migration.txt',
  'dialer-client.txt',
  'dialer-actions.txt',
  'dialer-page.txt',
  'contact-actions.txt',
  'crm-migration.txt',
  'tsconfig.tsbuildinfo'
)

foreach ($path in $remove) {
  if (Test-Path $path) {
    Remove-Item $path -Recurse -Force
    Write-Host "Removed $path"
  }
}

Write-Host 'Retired telephony files removed. Now copy the replacement src, package.json, package-lock.json, and migration from this package into the project root.'
