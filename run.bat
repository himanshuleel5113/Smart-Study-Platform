@echo off
setlocal
cd /d "%~dp0"

echo ====================================================
echo Starting Smart Study Platform (Local Development)...
echo ====================================================

set JWT_SECRET=MTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI=
set USER_DB_PASSWORD=postgres
set STUDY_DB_PASSWORD=postgres
set QUIZ_DB_PASSWORD=postgres
set AZURE_OPENAI_KEY=dummy-key-for-local-dev
set OPENAI_BASE_URL=https://studyplanneragent-resource.openai.azure.com/openai/v1

echo [1/5] Starting PostgreSQL databases via Docker...
docker compose up -d user-postgres study-postgres quiz-postgres

ping 127.0.0.1 -n 4 >nul

echo [2/5] Launching User Service on port 8081...
start "SmartStudy - User Service" /min cmd /k "set DB_URL=jdbc:postgresql://localhost:5432/user_db&& set DB_USERNAME=postgres&& set DB_PASSWORD=postgres&& set JWT_SECRET=%JWT_SECRET%&& java -Duser.timezone=UTC -jar services\user-service\target\user-service-1.0.0.jar"

echo [3/5] Launching Study Service on port 8082...
start "SmartStudy - Study Service" /min cmd /k "set DB_URL=jdbc:postgresql://localhost:5433/study_db&& set DB_USERNAME=postgres&& set DB_PASSWORD=postgres&& java -Duser.timezone=UTC -jar services\study-service\target\study-service-1.0.0.jar"

echo [4/5] Launching Quiz Service on port 8083...
start "SmartStudy - Quiz Service" /min cmd /k "set DB_URL=jdbc:postgresql://localhost:5434/quiz_db&& set DB_USERNAME=postgres&& set DB_PASSWORD=postgres&& set AZURE_OPENAI_KEY=%AZURE_OPENAI_KEY%&& set OPENAI_BASE_URL=%OPENAI_BASE_URL%&& java -Duser.timezone=UTC -jar services\quiz-service\target\quiz-service-1.0.0.jar"

echo [5/5] Launching API Gateway on port 8080...
start "SmartStudy - API Gateway" /min cmd /k "set JWT_SECRET=%JWT_SECRET%&& set USER_SERVICE_URL=http://localhost:8081&& set STUDY_SERVICE_URL=http://localhost:8082&& set QUIZ_SERVICE_URL=http://localhost:8083&& java -Duser.timezone=UTC -jar services\api-gateway\target\api-gateway-1.0.0.jar"

echo Starting Frontend on port 3000...
start "SmartStudy - Frontend" /min cmd /k "npx --yes serve frontend -l 3000"

echo ====================================================
echo All services launched!
echo Frontend UI: http://localhost:3000
echo API Gateway: http://localhost:8080
echo ====================================================
