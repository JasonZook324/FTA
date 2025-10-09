# start-servers.ps1
# Opens two new PowerShell windows and starts the backend and frontend dev servers.
# Usage: Right-click -> Run with PowerShell or run from a PowerShell prompt:
#   .\start-servers.ps1

# Get the directory this script lives in
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition

Write-Host "Starting dev servers from: $scriptDir"

# Command strings
$backendCmd = "cd '$scriptDir' ; npm run dev"
$frontendCmd = "cd '$scriptDir' ; npx vite"

# Start backend in a new PowerShell window
Start-Process -FilePath "powershell" -ArgumentList "-NoExit","-Command","$backendCmd" -WindowStyle Normal
Write-Host "Backend (npm run dev) launched in a new window"

# Start frontend in a new PowerShell window
Start-Process -FilePath "powershell" -ArgumentList "-NoExit","-Command","$frontendCmd" -WindowStyle Normal
Write-Host "Frontend (npx vite) launched in a new window"

Write-Host "Done. Check the two new windows for server output."