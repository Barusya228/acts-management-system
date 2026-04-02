@echo off
setlocal

set "ROOT=%~dp0..\.."

echo ================================
echo Frontend Start
echo ================================
echo.

if not exist "%ROOT%\frontend\package.json" (
    echo frontend\package.json not found.
    exit /b 1
)

pushd "%ROOT%\frontend"

if not exist ".env.local" if exist ".env.example" (
    copy /Y ".env.example" ".env.local" >nul
    echo Created frontend .env.local from .env.example
)

echo Starting Next.js on http://localhost:3000
call npm run dev

if errorlevel 1 (
    echo npm run dev failed. Trying npm-cli.js fallback...
    node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run dev
)

popd
