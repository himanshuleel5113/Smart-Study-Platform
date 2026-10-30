# Smart Study Platform - Start All Services
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "Starting Smart Study Platform Services..." -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan

# 1. Start PostgreSQL databases
Write-Host "[1/5] Starting PostgreSQL databases..." -ForegroundColor Yellow
docker compose up -d user-postgres study-postgres quiz-postgres

# Wait a brief moment for database healthchecks
Start-Sleep -Seconds 5

# Set common environment variables
$env:JWT_SECRET = "MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI="
$env:USER_DB_PASSWORD = "postgres"
$env:STUDY_DB_PASSWORD = "postgres"
$env:QUIZ_DB_PASSWORD = "postgres"
$env:AZURE_OPENAI_KEY = "dummy-key-for-local-dev"
$env:OPENAI_BASE_URL = "https://studyplanneragent-resource.openai.azure.com/openai/v1"

# 2. Start User Service (:8081)
Write-Host "[2/5] Starting User Service on port 8081..." -ForegroundColor Yellow
$userEnv = @{
    DB_URL = "jdbc:postgresql://localhost:5432/user_db"
    DB_USERNAME = "postgres"
    DB_PASSWORD = "postgres"
    JWT_SECRET = $env:JWT_SECRET
}
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; `$env:DB_URL='jdbc:postgresql://localhost:5432/user_db'; `$env:DB_USERNAME='postgres'; `$env:DB_PASSWORD='postgres'; `$env:JWT_SECRET='$env:JWT_SECRET'; java '-Duser.timezone=UTC' -jar services/user-service/target/user-service-1.0.0.jar" -WindowStyle Minimized

# 3. Start Study Service (:8082)
Write-Host "[3/5] Starting Study Service on port 8082..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; `$env:DB_URL='jdbc:postgresql://localhost:5433/study_db'; `$env:DB_USERNAME='postgres'; `$env:DB_PASSWORD='postgres'; java '-Duser.timezone=UTC' -jar services/study-service/target/study-service-1.0.0.jar" -WindowStyle Minimized

# 4. Start Quiz Service (:8083)
Write-Host "[4/5] Starting Quiz Service on port 8083..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; `$env:DB_URL='jdbc:postgresql://localhost:5434/quiz_db'; `$env:DB_USERNAME='postgres'; `$env:DB_PASSWORD='postgres'; `$env:AZURE_OPENAI_KEY='$env:AZURE_OPENAI_KEY'; `$env:OPENAI_BASE_URL='$env:OPENAI_BASE_URL'; java '-Duser.timezone=UTC' -jar services/quiz-service/target/quiz-service-1.0.0.jar" -WindowStyle Minimized

# 5. Start API Gateway (:8080)
Write-Host "[5/5] Starting API Gateway on port 8080..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; `$env:JWT_SECRET='$env:JWT_SECRET'; `$env:USER_SERVICE_URL='http://localhost:8081'; `$env:STUDY_SERVICE_URL='http://localhost:8082'; `$env:QUIZ_SERVICE_URL='http://localhost:8083'; java '-Duser.timezone=UTC' -jar services/api-gateway/target/api-gateway-1.0.0.jar" -WindowStyle Minimized

# 6. Start Frontend (:3000)
Write-Host "Starting Frontend Web Application on port 3000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; npx --yes serve frontend -l 3000" -WindowStyle Minimized

Write-Host "===============================================" -ForegroundColor Green
Write-Host "Smart Study Platform is now running!" -ForegroundColor Green
Write-Host "Frontend URL:    http://localhost:3000" -ForegroundColor Cyan
Write-Host "API Gateway:     http://localhost:8080" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Green
