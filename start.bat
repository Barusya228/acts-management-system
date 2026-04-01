@echo off
echo ================================
echo Starting Acts Management System
echo ================================
echo.

cd acts-frontend

echo Starting development server...
echo Open http://localhost:3000 in your browser
echo.
echo Press Ctrl+C to stop the server
echo.

call npm run dev

if %errorlevel% neq 0 (
    echo.
    echo Failed to start. Trying alternative method...
    node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run dev
)
