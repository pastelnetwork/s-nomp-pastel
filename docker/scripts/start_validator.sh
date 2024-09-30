#!/bin/bash

# Path to the validator directory
VALIDATOR_DIR="/root/pastel/mining_block_supernode_validator"

# Function to check if the node is synced
is_synced() {
  status=$( /root/pastel/pastel-cli mnsync status )
  is_synced=$(echo "$status" | grep '"IsSynced": true')

  if [[ -n "$is_synced" ]]; then
    return 0  # Node is synced
  else
    return 1  # Node is not synced
  fi
}

# Wait until the node is synced
echo "Checking if Pastel node is synced..."
while ! is_synced; do
  echo "Pastel node is not yet synced. Waiting..."
  sleep 10  # Wait 10 seconds before checking again
done

# Change to the validator directory
cd "$VALIDATOR_DIR" || exit

# Node is synced, start the validator
echo "Pastel node is synced! Starting the mining supernode validator from $VALIDATOR_DIR..."
python3 main.py &
