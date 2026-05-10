@echo off
setlocal
cd /d "%~dp0"

py -c "import sys" >nul 2>nul
if not errorlevel 1 if exist "%~dp0start.py" (
  py "%~dp0start.py" %*
  if errorlevel 1 goto :fail
  goto :eof
)

python -c "import sys" >nul 2>nul
if not errorlevel 1 if exist "%~dp0start.py" (
  python "%~dp0start.py" %*
  if errorlevel 1 goto :fail
  goto :eof
)

if exist "%~dp0Start-ERP.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-ERP.ps1" %*
  if errorlevel 1 goto :fail
  goto :eof
)

echo ERROR: start.py or Start-ERP.ps1 not found in the current folder.

goto :fail

:fail
echo.
echo ERROR: Startup failed.
pause
exit /b 1
