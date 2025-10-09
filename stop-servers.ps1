# stop-servers.ps1
# Kills all node.exe processes (backend/frontend servers) and prints a summary.
# Usage: Right-click -> Run with PowerShell or run from a PowerShell prompt:
#   .\stop-servers.ps1

Write-Host "Stopping all Node.js servers..."

# Get all node.exe processes
$nodes = Get-Process node -ErrorAction SilentlyContinue
if ($nodes) {
    $nodes | ForEach-Object {
        Write-Host "Killing node.exe (PID: $($_.Id))"
        Stop-Process -Id $_.Id -Force
    }
    Write-Host "All node.exe processes killed."
} else {
    Write-Host "No node.exe processes found."
}

Write-Host "Done."