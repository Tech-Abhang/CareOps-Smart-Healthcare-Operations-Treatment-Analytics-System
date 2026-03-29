@echo off
setlocal

set "ROOT=%~dp0phase8_dashboard"

if not exist "%ROOT%\package.json" (
  echo Could not find phase8_dashboard folder next to this launcher.
  pause
  exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo npm.cmd was not found. Please install Node.js first.
  pause
  exit /b 1
)

if not exist "%ROOT%\node_modules" (
  echo Installing frontend dependencies...
  call npm.cmd install --prefix "%ROOT%"
  if errorlevel 1 goto :fail
)

if not exist "%ROOT%\server\node_modules" (
  echo Installing backend dependencies...
  call npm.cmd install --prefix "%ROOT%\server"
  if errorlevel 1 goto :fail
)

:prompt_password
echo.
echo === MySQL Connection Setup ===
set "CAREOPS_DB_PASSWORD="
set /p CAREOPS_DB_PASSWORD="Enter MySQL Root Password (type 'none' if empty): "
echo.

if "%CAREOPS_DB_PASSWORD%"=="none" set "CAREOPS_DB_PASSWORD="

if "%CAREOPS_DB_PASSWORD%"=="" (
  echo WARNING: No password entered. Continuing with empty password...
)

echo Running SQL + ETL setup pipeline...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_demo.ps1"
set "RUN_DEMO_EXIT_CODE=%ERRORLEVEL%"

if %RUN_DEMO_EXIT_CODE% equ 2 (
  echo.
  echo [RETRY] Access Denied. Please check your password and try again.
  pause
  goto prompt_password
)

if %RUN_DEMO_EXIT_CODE% neq 0 (
  echo SQL/ETL setup failed. Check errors above before launching dashboard.
  pause
  exit /b 1
)

echo Stopping any existing CareOps processes on ports 4000 and 5173...
for %%P in (4000 5173) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do (
    taskkill /PID %%A /F >nul 2>&1
  )
)
timeout /t 1 >nul

set "CAREOPS_REQUIRE_PASSWORD_PROMPT=0"
set "MYSQL_PASSWORD=%CAREOPS_DB_PASSWORD%"
set "MYSQL_HOST=127.0.0.1"

echo Starting CareOps API...
start "CareOps API" cmd /k "cd /d ""%ROOT%"" && npm.cmd run server"

echo Waiting for API startup...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; 1..20 | ForEach-Object { try { Invoke-RestMethod -Uri 'http://localhost:4000/api/session/status' -TimeoutSec 1 > $null; $ok=$true; break } catch { Start-Sleep -Milliseconds 400 } }; if (-not $ok) { exit 1 }"
if errorlevel 1 (
  echo API failed to start on http://localhost:4000.
  echo Check the "CareOps API" window for the exact error.
  pause
  exit /b 1
)

echo Starting CareOps UI...
start "CareOps UI" cmd /k "cd /d ""%ROOT%"" && npm.cmd run dev"

timeout /t 3 >nul
start "" http://localhost:5173

echo CareOps is launching.
exit /b 0

:fail
echo Launch failed.
pause
exit /b 1
