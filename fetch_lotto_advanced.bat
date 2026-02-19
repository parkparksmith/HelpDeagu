@echo off
echo ===================================================
echo   Lotto Data Fetcher (Advanced Browser Mode)
echo ===================================================
echo.
echo Installing DrissionPage library (Required for bypassing blocking)...
pip install DrissionPage
if %errorlevel% neq 0 (
    echo.
    echo Failed to install DrissionPage. Make sure Python/pip is installed.
    pause
    exit /b
)
echo.
echo Launching the browser automation tool...
echo Please do not close the browser window that opens.
echo.
python fetch_lotto_browser.py
echo.
echo ===================================================
echo Done! Check Json\Lotto\lotto_history.json
echo ===================================================
pause
