@echo off
REM — start.bat: launch KeepUP-v2, ensuring Node is on PATH

echo Refreshing environment variables…
if defined ChocolateyInstall (
  call "%ChocolateyInstall%\bin\refreshenv.cmd"
)

cd /d "%USERPROFILE%\KeepUP-v2"
echo Starting KeepUP-v2 on http://localhost:3000 …
npm start
pause
