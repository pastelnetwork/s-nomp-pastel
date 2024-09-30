@echo off
REM Ensure docker-config.ini exists
if not exist "docker-config.ini" (
    echo docker-config.ini file not found!
    exit /b 1
)

REM Use PowerShell to read network_type from docker-config.ini
for /f "tokens=*" %%i in ('powershell -Command "(Select-String -Path 'docker-config.ini' -Pattern '^network_type=').Line -replace 'network_type=', ''"') do set NETWORK=%%i

REM Check if NETWORK is set correctly
IF "%NETWORK%"=="" (
    echo Network type not found in docker-config.ini
    exit /b 1
)

REM Print the network type
echo Building for network type: %NETWORK%

REM Build the Docker image with the extracted network type
docker build --no-cache --build-arg NETWORK=%NETWORK% -t pastel-mining-pool-%NETWORK% .

REM Check if the build was successful
IF %ERRORLEVEL% NEQ 0 (
    echo Docker build failed!
    exit /b 1
) ELSE (
    echo Docker build succeeded for %NETWORK%.
)
