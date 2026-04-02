@echo off
setlocal

set "ROOT=%~dp0..\.."

echo ================================
echo Backend Install
echo ================================
echo.

if not exist "%ROOT%\backend\requirements.txt" (
    echo backend\requirements.txt not found.
    exit /b 1
)

pushd "%ROOT%\backend"

python --version >nul 2>&1
if errorlevel 1 (
    echo Python 3.11+ is required and was not found in PATH.
    echo Install Python and rerun this script.
    popd
    exit /b 1
)

if not exist "venv\Scripts\python.exe" (
    echo Creating virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo Failed to create backend virtual environment.
        popd
        exit /b 1
    )
)

call "venv\Scripts\activate"
if errorlevel 1 (
    echo Failed to activate backend virtual environment.
    popd
    exit /b 1
)

echo Upgrading pip...
python -m pip install --upgrade pip
if errorlevel 1 (
    echo Failed to upgrade pip.
    popd
    exit /b 1
)

echo Installing backend dependencies...
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo Failed to install backend dependencies.
    popd
    exit /b 1
)

if not exist ".env" if exist ".env.example" (
    copy /Y ".env.example" ".env" >nul
    echo Created backend .env from .env.example
)

popd

echo.
echo Backend installation complete.
echo Next step for database setup:
echo   docker-compose up -d db
echo   cd backend
echo   venv\Scripts\activate
echo   alembic upgrade head
echo   python scripts\seed_admin.py
echo   python scripts\seed_templates.py
echo.
exit /b 0
