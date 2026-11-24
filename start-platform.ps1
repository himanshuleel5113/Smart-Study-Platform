# Start the local Docker Compose stack. Use -Build after changing source code.
[CmdletBinding()]
param(
    [switch]$Build,
    [ValidateRange(10, 1800)]
    [int]$WaitTimeoutSeconds = 300
)

$ErrorActionPreference = 'Stop'
$composeArgs = @(
    'compose', '--project-name', 'smart-study-platform-main',
    '--project-directory', $PSScriptRoot,
    '--file', (Join-Path $PSScriptRoot 'docker-compose.yml'),
    '--env-file', (Join-Path $PSScriptRoot '.env')
)

function Invoke-Compose {
    param([string[]]$CommandArgs)
    & docker @composeArgs @CommandArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose failed (exit $LASTEXITCODE). Check the output above."
    }
}

function Test-DockerEngine {
    try {
        & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    }
}

try {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker is not installed or is not on PATH. Install Docker Desktop first.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot '.env'))) {
        throw 'Missing .env in the project root. Configure it using the README before starting.'
    }

    if (-not (Test-DockerEngine)) {
        $desktopPath = Join-Path $env:ProgramFiles 'Docker/Docker/Docker Desktop.exe'
        if (-not (Test-Path -LiteralPath $desktopPath)) {
            throw 'Docker is unavailable and Docker Desktop was not found. Start your Docker engine, then retry.'
        }
        Write-Host 'Starting Docker Desktop and waiting for its engine...' -ForegroundColor Yellow
        if (-not (Get-Process -Name 'Docker Desktop' -ErrorAction SilentlyContinue)) {
            Start-Process -FilePath $desktopPath -WindowStyle Hidden
        }
        $engineDeadline = (Get-Date).AddSeconds($WaitTimeoutSeconds)
        while (-not (Test-DockerEngine)) {
            if ((Get-Date) -ge $engineDeadline) {
                throw 'Docker Desktop did not become ready in time. Check Docker Desktop diagnostics and retry.'
            }
            Start-Sleep -Seconds 3
        }
    }
    Invoke-Compose -CommandArgs @('config', '--quiet')

    if ($Build) {
        if (-not (Get-Command mvn -ErrorAction SilentlyContinue)) {
            throw 'Building requires Java 21 or newer and Maven on PATH.'
        }
        Write-Host 'Testing and packaging the backend services...' -ForegroundColor Cyan
        & mvn -B -ntp -f (Join-Path $PSScriptRoot 'pom.xml') package
        if ($LASTEXITCODE -ne 0) {
            throw 'Backend tests or packaging failed. Containers have not been updated.'
        }
        Invoke-Compose -CommandArgs @('build')
    }

    Write-Host 'Starting Smart Study Platform using the existing .env configuration...' -ForegroundColor Cyan
    # Pull any missing images (such as Nagios base image) automatically
    $pullPolicy = 'missing'
    Invoke-Compose -CommandArgs @(
        'up', '-d', '--no-build', '--pull', $pullPolicy, '--remove-orphans',
        '--wait', '--wait-timeout', "$WaitTimeoutSeconds"
    )

    # Also check connectivity between containers and the public frontend URL.
    # Probe from the frontend so internal backend ports stay private.
    $probes = @(
        @{ Name = 'user-service'; Url = 'http://user-service:8081/actuator/health'; Field = 'status'; Expected = 'UP' },
        @{ Name = 'study-service'; Url = 'http://study-service:8082/actuator/health'; Field = 'status'; Expected = 'UP' },
        @{ Name = 'quiz-service'; Url = 'http://quiz-service:8083/actuator/health'; Field = 'status'; Expected = 'UP' },
        @{ Name = 'api-gateway'; Url = 'http://api-gateway:8080/actuator/health'; Field = 'status'; Expected = 'UP' },
        @{ Name = 'nagios'; Url = 'http://nagiosadmin:nagios@nagios:80/nagios/'; Field = ''; Expected = '' }
    )
    Write-Host 'Waiting for application and monitoring health checks...' -ForegroundColor Yellow
    $deadline = (Get-Date).AddSeconds($WaitTimeoutSeconds)
    $previousPending = ''
    do {
        $pending = @()
        foreach ($probe in $probes) {
            try {
                $body = & docker @composeArgs exec -T frontend wget -q -T 3 -O - $probe.Url 2>$null
                if ($LASTEXITCODE -ne 0) {
                    $pending += $probe.Name
                } elseif ($probe.Field -and (($body | ConvertFrom-Json).($probe.Field) -ne $probe.Expected)) {
                    $pending += $probe.Name
                }
            } catch {
                $pending += $probe.Name
            }
        }
        try {
            $response = Invoke-WebRequest -Uri 'http://localhost' -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -ne 200 -or $response.Content -notmatch 'Smart Study') {
                $pending += 'frontend'
            }
        } catch {
            $pending += 'frontend'
        }
        if ($pending.Count -eq 0) { break }
        $pendingText = $pending -join ', '
        if ($pendingText -ne $previousPending) {
            Write-Host "Waiting for: $pendingText" -ForegroundColor Yellow
            $previousPending = $pendingText
        }
        if ((Get-Date) -ge $deadline) {
            throw "Startup timed out waiting for: $($pending -join ', '). Inspect docker compose logs for those services."
        }
        Start-Sleep -Seconds 3
    } while ($true)

    Write-Host 'Smart Study Platform is ready.' -ForegroundColor Green
    Write-Host 'Frontend:    http://localhost'
    Write-Host 'API Gateway: http://localhost:8080'
    Write-Host 'Nagios Core: http://localhost:8090/nagios/ (nagiosadmin / nagios)'
    Write-Host 'AI generation requires valid credentials; startup does not call the AI provider.'
    exit 0
} catch {
    Write-Error $_ -ErrorAction Continue
    Write-Host 'For missing or outdated application images, run: .\start-platform.ps1 -Build'
    exit 1
}
