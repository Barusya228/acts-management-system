@echo off
setlocal

set "ROOT=%~dp0..\.."

echo ================================
echo Backend Start
echo ================================
echo.

if not exist "%ROOT%\backend\app\main.py" (
    echo backend\app\main.py not found.
    exit /b 1
)

if not exist "%ROOT%\backend\venv\Scripts\python.exe" (
    echo Backend virtual environment not found.
    echo Run scripts\windows\backend-install.bat first.
    exit /b 1
)

pushd "%ROOT%\backend"

if not exist ".env" if exist ".env.example" (
    copy /Y ".env.example" ".env" >nul
    echo Created backend .env from .env.example
)

call "venv\Scripts\activate"
if errorlevel 1 (
    echo Failed to activate backend virtual environment.
    popd
    exit /b 1
)

echo Starting FastAPI on http://localhost:8000
python -m uvicorn app.main:app --reload

popd
