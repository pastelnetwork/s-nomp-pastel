@echo off

REM Step 1: Read network type from docker-build.ini
for /f "tokens=2 delims==" %%i in ('findstr network_type docker-config.ini') do set NETWORK=%%i
echo Network Type: %NETWORK%

REM Step 2: Find existing container from the pastel-mining-pool-mainnet image
for /f "tokens=*" %%i in ('docker ps -a --filter "ancestor=pastel-mining-pool-%NETWORK%" --format "{{.ID}}"') do set CONTAINER_ID=%%i

if defined CONTAINER_ID (
    echo Found existing container with ID: %CONTAINER_ID%
    REM Step 3: Start the existing container
    docker start %CONTAINER_ID%
) else (
    echo No existing container found. Creating a new container...
    REM Step 4: Run a new container with the specified network type
    docker run -d -p 3255:3255 -p 9997:9997 -p 8080:8080 --name pastel-%NETWORK%-pool --env NETWORK=%NETWORK% pastel-mining-pool-mainnet
)