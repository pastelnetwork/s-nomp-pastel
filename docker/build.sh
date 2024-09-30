#!/bin/bash

# Ensure docker-config.ini exists
if [ ! -f "docker-config.ini" ]; then
    echo "docker-config.ini file not found!"
    exit 1
fi

# Read network_type from docker-config.ini
NETWORK=$(grep '^network_type=' docker-config.ini | cut -d '=' -f 2 | tr -d '[:space:]')

# Check if NETWORK is set correctly
if [ -z "$NETWORK" ]; then
    echo "Network type not found in docker-config.ini"
    exit 1
fi

# Print the network type
echo "Building for network type: $NETWORK"

# Build the Docker image with the extracted network type
docker build --no-cache --build-arg NETWORK="$NETWORK" -t "pastel-mining-pool-$NETWORK" .

# Check if the build was successful
if [ $? -ne 0 ]; then
    echo "Docker build failed!"
    exit 1
else
    echo "Docker build succeeded for $NETWORK."
fi
