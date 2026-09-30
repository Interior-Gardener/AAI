@echo off
REM One-time setup for Windows: creates a virtual environment, installs packages, downloads models.
cd /d "%~dp0"
where python >nul 2>nul || (echo Python 3.10+ is required: https://www.python.org/downloads/ & pause & exit /b 1)
if not exist .venv python -m venv .venv
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -r requirements.txt || (echo Package installation failed. & pause & exit /b 1)
python scripts\download_models.py
echo.
echo Setup complete. Double-click start.bat to launch PixelProse.
pause
