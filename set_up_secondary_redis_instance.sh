#!/bin/bash

# Set up a secondary Redis instance on port 6380

# Stop on any error
set -e

# Step 1: Copy the original Redis configuration to a new file
echo "Copying original Redis config to a new custom config..."
sudo cp /etc/redis/redis.conf /etc/redis/redis_custom.conf

# Step 2: Modify the copied configuration file for the new instance
echo "Modifying custom Redis config for the new instance..."
sudo sed -i 's/^port .*/port 6380/' /etc/redis/redis_custom.conf
sudo sed -i 's/^# requirepass foobared/requirepass yourpassword/' /etc/redis/redis_custom.conf # Optional: Set a password
echo "databases 16" | sudo tee -a /etc/redis/redis_custom.conf > /dev/null

# Ensure correct ownership and permissions
echo "Setting correct permissions for the custom config file..."
sudo chown redis:redis /etc/redis/redis_custom.conf
sudo chmod 644 /etc/redis/redis_custom.conf

# Step 3: Start the new Redis instance with the custom configuration
echo "Starting new Redis instance with custom configuration..."
sudo redis-server /etc/redis/redis_custom.conf

# Optional: Test the new Redis instance
echo "Testing the new Redis instance..."
sleep 2 # Wait a bit for Redis to start
redis-cli -p 6380 ping

# Step 4: Create a new systemd service file for the Redis instance
echo "Creating a new systemd service file..."
cat << EOF | sudo tee /etc/systemd/system/redis_6380.service > /dev/null
[Unit]
Description=Redis In-Memory Data Store on port 6380
After=network.target

[Service]
User=redis
Group=redis
ExecStart=/usr/bin/redis-server /etc/redis/redis_custom.conf
ExecStop=/usr/bin/redis-cli -p 6380 shutdown
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Step 5: Reload systemd, enable and start the new Redis service
echo "Enabling and starting the new Redis service..."
sudo systemctl daemon-reload
sudo systemctl enable redis_6380.service
sudo systemctl start redis_6380.service

# Confirm the service is running
echo "Checking the status of the new Redis service..."
sudo systemctl status redis_6380.service

echo "Secondary Redis instance setup complete."
