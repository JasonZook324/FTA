Quick start helpers

Files:
- `start-servers.ps1` - PowerShell script that opens two PowerShell windows and runs the backend and frontend dev servers.
- `start-servers.cmd` - Double-clickable Windows CMD wrapper that runs the PowerShell script with elevated execution policy bypass.

Usage:
- Double-click `start-servers.cmd` in File Explorer to launch both servers in new windows.
- Or run the PowerShell script directly from a terminal:

```powershell
cd path\to\FTA
.\start-servers.ps1
```

Notes:
- The script uses the repo root as the working directory.
- It keeps the windows open so you can see server output and errors.
- If PowerShell execution policy blocks the script, run PowerShell as Administrator and set `Set-ExecutionPolicy RemoteSigned` temporarily.
