# Smart Study Platform - Stop All Services
Write-Host "Stopping Smart Study Platform..." -ForegroundColor Yellow

# Kill running java jar processes
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*smart-study*" -or $_.CommandLine -like "*user-service*" -or $_.CommandLine -like "*study-service*" -or $_.CommandLine -like "*quiz-service*" -or $_.CommandLine -like "*api-gateway*" } | ForEach-Object {
    Write-Host "Stopping process PID $($_.ProcessId)..."
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

# Stop frontend server (serve)
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*serve frontend*" } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

# Stop database containers
docker compose stop user-postgres study-postgres quiz-postgres

Write-Host "All Smart Study Platform services have been stopped." -ForegroundColor Green
