@echo off
echo 🚀 Starting Piston API...
docker start piston_api 2>nul
if %errorlevel% neq 0 (
    echo ⚠️ Container not found, creating new one...
    docker run --privileged -p 2000:2000 -v D:/RAG-UI-main/piston/packages:/piston/packages --name piston_api ghcr.io/engineer-man/piston
)
echo ✅ Piston API running on http://localhost:2000