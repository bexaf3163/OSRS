# Test the actual release artifact alone in a disposable runner directory.
# No player installation, RuneLite process or live account is used by test:e2e.
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if (-not $env:RUNNER_TEMP -or -not (Test-Path -LiteralPath $env:RUNNER_TEMP -PathType Container)) {
    throw 'This script requires an existing CI RUNNER_TEMP directory.'
}
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$source = Join-Path $projectRoot "release/OSRS-Put-$version-portable.exe"
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Portable artifact missing: $source" }
$candidateDir = Join-Path $env:RUNNER_TEMP ('osrs-portable-check-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $candidateDir | Out-Null
$candidate = Join-Path $candidateDir ([System.IO.Path]::GetFileName($source))
Copy-Item -LiteralPath $source -Destination $candidate
$digest = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash.ToLowerInvariant()
if ($digest -ne (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()) {
    throw 'Portable test copy differs from the release artifact.'
}
Write-Output "Testing portable $version (SHA-256 $digest)"
$oldCandidate = $env:E2E_EXE
Push-Location $projectRoot
try {
    $env:E2E_EXE = $candidate
    & npm.cmd run test:e2e
    if ($LASTEXITCODE -ne 0) { throw "Packaged E2E failed with exit code $LASTEXITCODE" }
    # Recheck the exact artifact that the later release step will publish.
    if ($digest -ne (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()) {
        throw 'The release artifact changed during its verification.'
    }
    if ($env:GITHUB_STEP_SUMMARY) {
        "Portable $version passed isolated packaged E2E. SHA-256: $digest" | Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY
    }
} finally {
    $env:E2E_EXE = $oldCandidate
    Pop-Location
}
# The disposable directory is left to the runner VM's cleanup; no recursive path deletion here.
