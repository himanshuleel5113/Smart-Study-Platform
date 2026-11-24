# Stop only this project's Compose containers. Keep containers and data volumes.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$composeArgs = @(
    'compose', '--project-name', 'smart-study-platform-main',
    '--project-directory', $PSScriptRoot,
    '--file', (Join-Path $PSScriptRoot 'docker-compose.yml')
)
$envFile = Join-Path $PSScriptRoot '.env'
if (Test-Path -LiteralPath $envFile) {
    $composeArgs += @('--env-file', $envFile)
}

try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker is not installed or is not on PATH.'
    }
    Write-Host 'Stopping Smart Study Platform containers...' -ForegroundColor Yellow
    & docker @composeArgs stop --timeout 30
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose stop failed (exit $LASTEXITCODE). Check that Docker Desktop is running."
    }
    Write-Host 'Smart Study Platform stopped. Containers and database volumes are preserved.' -ForegroundColor Green
    exit 0
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}
