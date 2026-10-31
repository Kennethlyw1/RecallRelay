$ErrorActionPreference = 'Stop'
$recallNode = Get-Command node -ErrorAction SilentlyContinue
if ($recallNode) {
    $recallNodePath = $recallNode.Source
} else {
    $recallNodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $recallNodePath)) {
    throw 'Node.js 22 or newer is required. Install it from nodejs.org, then run this script again.'
}
Push-Location -LiteralPath $PSScriptRoot
try {
    Write-Host 'Open http://127.0.0.1:4317 in your browser. Press Ctrl+C to stop RecallRelay.'
    & $recallNodePath server.mjs
} finally {
    Pop-Location
}
