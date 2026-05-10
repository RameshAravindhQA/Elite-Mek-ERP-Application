@echo off
setlocal
cd /d "%~dp0"

if exist "%~dp0Start-Backend.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Backend.ps1" %*
  if errorlevel 1 goto :fail
  goto :eof
)

echo ERROR: Start-Backend.ps1 not found in the current folder.

:fail
echo.
echo ERROR: Backend startup failed.
pause
exit /b 1
