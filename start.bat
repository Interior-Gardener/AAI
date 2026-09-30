@echo off
REM Launch PixelProse and open it in the default browser.
cd /d "%~dp0"
call .venv\Scripts\activate.bat
start "" http://127.0.0.1:8000
python run.py
pause
