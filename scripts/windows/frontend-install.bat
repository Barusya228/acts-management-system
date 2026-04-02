@echo off
setlocal

set "ROOT=%~dp0..\.."

echo ================================
echo Frontend Install
echo ================================
echo.

if not exist "%ROOT%\frontend\package.json" (
    echo frontend\package.json not found.
    exit /b 1
)

pushd "%ROOT%\frontend"

echo Installing frontend dependencies...
call npm install

if errorlevel 1 (
    echo npm install failed. Trying npm-cli.js fallback...
    node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install
    if errorlevel 1 (
        echo Failed to install frontend dependencies.
        popd
        exit /b 1
    )
)

if not exist ".env.local" if exist ".env.example" (
    copy /Y ".env.example" ".env.local" >nul
    echo Created frontend .env.local from .env.example
)

popd

echo.
echo Frontend installation complete.
echo.
exit /b 0
