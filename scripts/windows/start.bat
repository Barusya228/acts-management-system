@echo off
setlocal

echo ================================
echo Starting Acts Management System
echo ================================
echo.

set "ROOT=%~dp0..\.."

REM Check backend venv
if not exist "%ROOT%\backend\venv\Scripts\python.exe" (
    echo Backend virtual environment not found.
    echo Running backend-install.bat...
    echo.
    call "%~dp0backend-install.bat"
    if errorlevel 1 (
        echo Backend installation failed.
        pause
        exit /b 1
    )
)

REM Check frontend node_modules
if not exist "%ROOT%\frontend\node_modules" (
    echo Frontend node_modules not found.
    echo Running frontend-install.bat...
    echo.
    call "%~dp0frontend-install.bat"
    if errorlevel 1 (
        echo Frontend installation failed.
        pause
        exit /b 1
    )
)

if not exist "%~dp0backend-start.bat" (
    echo backend-start.bat not found.
    exit /b 1
)

if not exist "%~dp0frontend-start.bat" (
    echo frontend-start.bat not found.
    exit /b 1
)

echo.
echo Starting backend and frontend...
echo.

start "Acts Backend" cmd /k call "%~dp0backend-start.bat"
timeout /t 3 /nobreak >nul
start "Acts Frontend" cmd /k call "%~dp0frontend-start.bat"

echo.
echo Open these URLs after startup:
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:8000
echo.
echo Two windows were opened: one for backend and one for frontend.
echo.
exit /b 0
