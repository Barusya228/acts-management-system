@echo off
setlocal

echo ================================
echo Acts Management System - Install
echo ================================
echo.
echo This script runs both installers:
echo   1. scripts\windows\backend-install.bat
echo   2. scripts\windows\frontend-install.bat
echo.

call "%~dp0backend-install.bat"
if errorlevel 1 (
    echo.
    echo Backend installation failed.
    exit /b 1
)

echo.
call "%~dp0frontend-install.bat"
if errorlevel 1 (
    echo.
    echo Frontend installation failed.
    exit /b 1
)

echo.
echo ================================
echo Installation complete
echo ================================
echo.
echo Start everything with:
echo   scripts\windows\start.bat
echo.
pause
