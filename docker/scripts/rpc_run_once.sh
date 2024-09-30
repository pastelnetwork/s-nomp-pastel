#!/bin/bash

PASTEL_CLI="/root/pastel/pastel-cli"

# Function to check if the node is synced
is_synced() {
  status=$( $PASTEL_CLI mnsync status )
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

# add any RPC commands here, for example to import private keys
# $PASTEL_CLI importprivkey aaabbbcccdddeeefffggghhhiiijjjkkk
# =====================================================================================

# =====================================================================================
# this file will be deleted once run in the container after pasteld started and synced
# Self-delete the script
echo "Deleting the script to prevent it from running again..."
rm -- "$0"

