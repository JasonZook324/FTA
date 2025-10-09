@echo off
REM stop-servers.cmd - Windows double-clickable wrapper to run the PowerShell script
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -Command "& '%SCRIPT_DIR%stop-servers.ps1'"
pause