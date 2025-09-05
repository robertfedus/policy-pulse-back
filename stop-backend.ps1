# stop-backend.ps1
# Stops the backend container if running

$CONTAINER_NAME = "api"

Write-Host "🛑 Stopping container: $CONTAINER_NAME ..."
docker stop $CONTAINER_NAME 2>$null

if ($LASTEXITCODE -eq 0) {
  Write-Host "✅ Container stopped."
} else {
  Write-Host "ℹ️ No container named $CONTAINER_NAME is running."
}
