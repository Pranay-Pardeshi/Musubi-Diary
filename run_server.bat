@echo off
echo Starting Musubi Diary Local Server...
echo This fixes the "Internet connection error" by running a proper web server.
echo.
echo Please leave this window open while you use the diary.
echo Opening http://localhost:8000 in your browser...

:: Open browser after a 1 second delay to give the server time to start
start "" "http://localhost:8000"

:: Start the python http server
python -m http.server 8000

pause
