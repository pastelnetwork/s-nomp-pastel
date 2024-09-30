#!/bin/bash

# Paths for configuration files
PASTEL_CONF="/root/.pastel/pastel.conf"
DOCKER_CONFIG="/root/docker-config.ini"
VALIDATOR_ENV_FILE="/root/pastel/mining_block_supernode_validator/.env"
SNOMP_ENV_FILE="/root/pastel/s-nomp/.env"

# Extract network type from docker-config.ini
network_type=$(crudini --get "$DOCKER_CONFIG" s-nomp network_type)
echo "Detected network type: $network_type"

# Set the correct config file based on the network type
POOL_CONFIG_FILE="/root/pastel/s-nomp/pool_configs/psl.${network_type}.json"

# Set the correct RPC port based on the network type
if [[ "$network_type" == "mainnet" ]]; then
    RPC_PORT="9932"
elif [[ "$network_type" == "testnet" ]]; then
    RPC_PORT="19932"
elif [[ "$network_type" == "devnet" ]]; then
    RPC_PORT="29932"
else
    echo "Unknown network type: $network_type"
    exit 1
fi

# Update the .env file with the correct PASTELIDS_FILENAME
pastelids_file="pastelids_for_${network_type}_sns.yml"
echo "Updating .env with PASTELIDS_FILENAME=$pastelids_file"
echo "PASTELIDS_FILENAME=$pastelids_file" >> "$VALIDATOR_ENV_FILE"

# Extract rpcuser and rpcpassword from pastel.conf
rpcuser=$(grep -oP '^rpcuser=\K.*' "$PASTEL_CONF")
rpcpassword=$(grep -oP '^rpcpassword=\K.*' "$PASTEL_CONF")
echo "rpcuser=$rpcuser, rpcpassword=$rpcpassword"

# Read values from docker-config.ini
reward_address=$(crudini --get "$DOCKER_CONFIG" s-nomp reward_address)
from_zAddress=$(crudini --get "$DOCKER_CONFIG" s-nomp from_zAddress)
from_tAddress=$(crudini --get "$DOCKER_CONFIG" s-nomp from_tAddress)
echo "reward_address=$reward_address, from_zAddress=$from_zAddress, from_tAddress=$from_tAddress"

# Use jq to update the JSON file
jq --arg rpcuser "$rpcuser" \
   --arg rpcpassword "$rpcpassword" \
   --arg reward_address "$reward_address" \
   --arg from_zAddress "$from_zAddress" \
   --arg from_tAddress "$from_tAddress" \
   '.enabled = true |
    .address = $reward_address |
    .zAddress = $from_zAddress |
    .tAddress = $from_tAddress |
    .paymentProcessing.daemon.user = $rpcuser |
    .paymentProcessing.daemon.password = $rpcpassword |
    .daemons[0].user = $rpcuser |
    .daemons[0].password = $rpcpassword' \
   "$POOL_CONFIG_FILE" > "${POOL_CONFIG_FILE}.modified" && \
mv "${POOL_CONFIG_FILE}.modified" "$POOL_CONFIG_FILE"

# Update the s-nomp .env file with RPC details
echo "Updating s-nomp/.env with RPC details"
echo "RPC_HOST=127.0.0.1" >> "$SNOMP_ENV_FILE"
echo "RPC_PORT=$RPC_PORT" >> "$SNOMP_ENV_FILE"
echo "RPC_USER=$rpcuser" >> "$SNOMP_ENV_FILE"
echo "RPC_PASSWORD=$rpcpassword" >> "$SNOMP_ENV_FILE"
