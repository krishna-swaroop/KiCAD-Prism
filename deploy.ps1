# KiCAD Prism deployment installer (Windows PowerShell).
#
# Thin launcher: locates a Python interpreter and hands over to
# scripts/prism_deploy. Prefers a native interpreter, falls back to WSL2, which
# is the recommended way to run Prism on Windows anyway.
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Test-Python($exe, $argsPrefix) {
    try {
        $all = @($argsPrefix + @('-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)')) | Where-Object { $_ }
        & $exe @all 2>$null
        return $LASTEXITCODE -eq 0
    } catch { return $false }
}

foreach ($candidate in @(@('py', @('-3')), @('python3', @()), @('python', @()))) {
    $exe = $candidate[0]
    $prefix = $candidate[1]
    if (Get-Command $exe -ErrorAction SilentlyContinue) {
        if (Test-Python $exe $prefix) {
            & $exe @($prefix + @('-m', 'scripts.prism_deploy') + $args)
            exit $LASTEXITCODE
        }
    }
}

if (Get-Command wsl -ErrorAction SilentlyContinue) {
    Write-Host 'No native Python found; running through WSL2.' -ForegroundColor DarkGray
    wsl python3 -m scripts.prism_deploy @args
    exit $LASTEXITCODE
}

Write-Error @'
Python 3.9 or newer is required.

Install it from https://www.python.org/downloads/ , or set up WSL2, which is the
recommended way to run Prism on Windows:
  https://learn.microsoft.com/en-us/windows/wsl/install
'@
exit 1
