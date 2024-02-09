#!/bin/bash

# Set up a secondary Redis instance on port 6380

# Stop on any error
set -e

# Define custom Redis configuration and service names
CONFIG_FILE="/etc/redis/redis_custom.conf"
SERVICE_NAME="redis_6380.service"
LOG_FILE="/var/log/redis/redis_6380.log"

echo "Cleaning up any existing setup for Redis on port 6380..."

echo "Ensuring no process is running on port 6380..."
sudo lsof -ti:6380 | xargs --no-run-if-empty sudo kill -9

# Step 0: Cleanup existing setup (if any)
if systemctl is-active --quiet $SERVICE_NAME; then
    echo "Stopping existing Redis service on port 6380..."
    sudo systemctl stop $SERVICE_NAME
fi

if systemctl is-enabled --quiet $SERVICE_NAME; then
    echo "Disabling existing Redis service on port 6380..."
    sudo systemctl disable $SERVICE_NAME
fi

if [ -f $CONFIG_FILE ]; then
    echo "Removing existing custom Redis configuration file..."
    sudo rm $CONFIG_FILE
fi

if [ -f /etc/systemd/system/$SERVICE_NAME ]; then
    echo "Removing existing systemd service file for Redis on port 6380..."
    sudo rm /etc/systemd/system/$SERVICE_NAME
    sudo systemctl daemon-reload
fi

echo "Existing setup for Redis on port 6380 cleaned up."

# # Proceed with setup as before
# echo "Setting up a new Redis instance on port 6380..."

# # (Re)Create the custom Redis configuration file
# echo "Copying original Redis config to a new custom config..."
# sudo cp /etc/redis/redis.conf $CONFIG_FILE

# # Modify the copied configuration file for the new Redis instance

# echo "Modifying custom Redis config for the new instance..."
# sudo sed -i 's/^port .*/port 6380/' $CONFIG_FILE
# # Disable authentication by commenting out the requirepass directive
# sudo sed -i 's/^requirepass/#requirepass/' $CONFIG_FILE
# # Ensure protected-mode is set to no
# sudo sed -i 's/^protected-mode yes/protected-mode no/' $CONFIG_FILE
# # Specify the separate logfile for the secondary Redis instance
# sudo sed -i "s#^logfile .*\$#logfile $LOG_FILE#" $CONFIG_FILE
# # Add databases directive only if necessary
# echo "databases 16" | sudo tee -a $CONFIG_FILE > /dev/null

# # Ensure correct permissions
# echo "Setting correct permissions for the custom config file..."
# sudo chown redis:redis $CONFIG_FILE
# sudo chmod 644 $CONFIG_FILE

# # (Re)Create the systemd service file
# echo "Creating a new systemd service file..."
# cat << EOF | sudo tee /etc/systemd/system/$SERVICE_NAME > /dev/null
# [Unit]
# Description=Redis In-Memory Data Store on port 6380
# After=network.target

# [Service]
# User=redis
# Group=redis
# ExecStart=/usr/bin/redis-server $CONFIG_FILE
# ExecStop=/usr/bin/redis-cli -p 6380 shutdown
# Restart=always
# StartLimitBurst=100000
# StartLimitIntervalSec=5

# [Install]
# WantedBy=multi-user.target
# EOF

# # Reload systemd, enable and start the new Redis service
# echo "Enabling and starting the new Redis service..."
# sudo systemctl daemon-reload
# sudo systemctl enable $SERVICE_NAME
# sudo systemctl start $SERVICE_NAME

# # Confirm the service is running
# echo "Checking the status of the new Redis service..."
# sudo systemctl status $SERVICE_NAME

# echo "Secondary Redis instance setup complete."
