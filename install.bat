@echo off
echo ================================
echo Acts Management System - Setup
echo ================================
echo.

cd acts-frontend

echo Installing dependencies...
echo.

call npm install

if %errorlevel% neq 0 (
    echo.
    echo Installation failed. Trying alternative method...
    node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" install
)

echo.
echo ================================
echo Installation complete!
echo ================================
echo.
echo To start the development server, run:
echo   cd acts-frontend
echo   npm run dev
echo.
echo Then open http://localhost:3000 in your browser
echo.
echo Test credentials:
echo   Admin: admin@example.com / admin123
echo   User: user@example.com / user123
echo.
pause
