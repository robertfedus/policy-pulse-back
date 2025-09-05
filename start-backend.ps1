# start-backend.ps1
# Builds and runs the backend container for development

$IMAGE_NAME = "policy-pulse-back-dev"
$CONTAINER_NAME = "api"

Write-Host "🚀 Building Docker image: $IMAGE_NAME ..."
docker build -t $IMAGE_NAME -f Dockerfile.dev .

if ($LASTEXITCODE -ne 0) {
  Write-Error "❌ Build failed. Aborting."
  exit 1
}

Write-Host "✅ Build succeeded. Starting container: $CONTAINER_NAME ..."

docker run --rm -it `
  --name $CONTAINER_NAME `
  -p 3000:3000 `
  --env-file .\.env `
  -v ${PWD}:/usr/src/app `
  -v /usr/src/app/node_modules `
  $IMAGE_NAME
