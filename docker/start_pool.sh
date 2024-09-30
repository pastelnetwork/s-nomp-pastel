#!/bin/bash

# Step 1: Read network type from docker-config.ini
NETWORK=$(grep 'network_type' docker-config.ini | cut -d '=' -f 2 | tr -d '[:space:]')
echo "Network Type: $NETWORK"

# Step 2: Find existing container from the pastel-mining-pool-$NETWORK image
CONTAINER_ID=$(docker ps -a --filter "ancestor=pastel-mining-pool-$NETWORK" --format "{{.ID}}")

if [ -n "$CONTAINER_ID" ]; then
    echo "Found existing container with ID: $CONTAINER_ID"
    # Step 3: Start the existing container
    docker start "$CONTAINER_ID"
else
    echo "No existing container found. Creating a new container..."
    # Step 4: Run a new container with the specified network type
    docker run -d -p 3255:3255 -p 9997:9997 -p 8080:8080 --name "pastel-${NETWORK}-pool" --env NETWORK="$NETWORK" "pastel-mining-pool-$NETWORK"
fi
