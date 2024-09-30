Here is the **Markdown document** that describes how to create and configure Docker for both Windows and Linux for **s-nomp** in the context of your project. It includes detailed steps for moving files, configuring Docker, and running the environment.

---

# Setting up Docker for s-nomp (Windows and Linux)

This guide explains how to build and run Docker containers for **s-nomp**, using Docker files located under the `docker` subfolder in the **s-nomp** GitHub repository. The guide covers the process for both Windows and Linux platforms.

## Docker Directory Structure

The Docker-related files are located under the `docker` subfolder in the repository:

```
docker/
    Dockerfile
    build.bat
    build.sh
    docker-config.ini
    start_pool.bat
    start_pool.sh
    files/
        mining_block_supernode_validator/
        pasteld/
        s-nomp/
    scripts/
        configure.sh
        rpc_run_once.sh
        start_validator.sh
        supervisord.conf
```

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop) for Windows or Docker Engine for Linux.
- Ensure you have the latest version of Docker installed and running.
- For Windows users, ensure that**WSL 2** is enabled.

## Step 1: Move Pastel Keys and Configure Supernodes

Before building the Docker image, move all the **Pastel Keys** files for Supernodes managed by the pool into the `files/pasteld/pastelkeys` directory. You can move to `files/pasteld` directory any files that you want to be installed in Pastel Daemon folder.

Next, configure the YAML file for the Mining Block Supernode validator by adding the details for each Supernode. File name depends on the network type:

* for`mainnet`: pastelids_for_mainnet_sns.yml
* for`testnet`: pastelids_for_testnet_sns.yml
* for`devnet`: pastelids_for_devnet_sns.yml

Move this YAML file into `files/mining_block_supernode_validator/`.

### Example YAML Configuration:

```yaml
all:
  MN01: 
    ip_address: <Supernode IP>
    txid_and_vout: <Transaction ID and Vout>
    pastelid: <Pastel ID>
    pwd: <Password for Pastel ID>
```

## Step 2: Configure `docker-config.ini`

The `docker-config.ini` file is where you configure the network type (mainnet, testnet, or devnet) and set reward addresses. This file is essential for the Docker build process. The file is used to configure config.json in s-nomp.

### Example `docker-config.ini`:

```ini
[s-nomp]
network_type=mainnet
reward_address=t1RewrdAdrsPstl...
from_zAddress=z1FronZaddr...
from_tAddress=t1FromTaddr...
```

- `network_type`: The network type (`mainnet`,`testnet`, or`devnet`).
- `reward_address`: The address where the mining rewards will be sent.
- `from_zAddress` and`from_tAddress`: Z and T addresses used for sending funds.

## Step 3: Add RPC Commands to `rpc_run_once.sh`

Edit the `rpc_run_once.sh` script to add RPC commands that will import the private keys for the reward addresses.

### Example `rpc_run_once.sh`:

```bash
#!/bin/bash

PASTEL_CLI="/root/pastel/pastel-cli"

# Wait until Pastel node is synced
while true; do
    status=$( /root/pastel/pastel-cli mnsync status )
    is_synced=$(echo "$status" | grep '"IsSynced": true')

    if [[ -n "$is_synced" ]]; then
        break
    else
        sleep 10
    fi
done

# Import private keys for reward addresses
$PASTEL_CLI importprivkey <private_key_for_reward_address>
$PASTEL_CLI importprivkey <private_key_for_from_zAddress>
$PASTEL_CLI importprivkey <private_key_for_from_tAddress>

# Delete this script after execution
rm -- "$0"
```

This script waits for the **Pastel node** to sync and then imports the private keys for the reward addresses. It deletes itself after execution.

## Step 4: Build the Docker Image

You can build the Docker image by running the appropriate script depending on your platform.

### On Windows:

Run the `build.bat` script:

```bash
.\build.bat
```

### On Linux:

Run the `build.sh` script:

```bash
./build.sh
```

Both scripts read the `network_type` from `docker-config.ini` and use it as a build argument for Docker. The image will be tagged as `pastel-mining-pool-<network_type>`.

### Example:

For `mainnet`, the image will be built as `pastel-mining-pool-mainnet`.

## Step 5: Start the Docker Container

To start the Docker container, use the respective script for your platform.

### On Windows:

Run the `start_pool.bat` script:

```bash
.\start_pool.bat
```

### On Linux:

Run the `start_pool.sh` script:

```bash
./start_pool.sh
```

These scripts check if a container already exists and either start the existing container or create a new one based on the network type.

## Step 6: Supervisor-Based Initialization and Sequence

The Docker container is initialized using **Supervisor**. The Docker container is initialized using **Supervisor** to manage multiple services. The `supervisord.conf` file defines the order and behavior of each service. Below is an explanation of the services being managed and the sequence of their execution.

### Supervisor Configuration (`supervisord.conf`):

```ini
[supervisord]
nodaemon=true
user=root

[program:pasteld]
command=/root/pastelup-linux-amd64 start node
autostart=true
autorestart=false
priority=1
stdout_logfile=/var/log/pastelup.log
stderr_logfile=/var/log/pastelup.log

[program:redis]
command=redis-server
autostart=true
autorestart=true
priority=1
stdout_logfile=/var/log/redis.log
stderr_logfile=/var/log/redis.err.log

[program:rpc_run_once]
command=/bin/bash /root/pastel/rpc_run_once.sh
autostart=false  # Start only after pasteld is ready
autorestart=false  # Don't restart the script
priority=2  # Run after pasteld
startsecs=30  # Start after pasteld has been running for 30 secs
stdout_logfile=/var/log/rpc_run_once.log
stderr_logfile=/var/log/rpc_run_once_error.log
startretries=0
exitcodes=0
condition=file_exists('/root/pastel/rpc_run_once.sh')

[program:mining_validator]
command=/bin/bash /root/start_validator.sh
autostart=true
autorestart=false
priority=2
startsecs=30  # Start after pasteld has been running for 30 secs
stdout_logfile=/var/log/start_mining_validator.log
stderr_logfile=/var/log/start_mining_validator.log

[program:s-nomp]
command=node init.js
directory=/root/pastel/s-nomp
autostart=true
autorestart=false
priority=3
startsecs=120
stdout_logfile=/var/log/snomp.log
stderr_logfile=/var/log/snomp.log

```

### Explanation of the Process Sequence:

1. **pasteld** :
   * The`pasteld` service is started using the command`/root/pastelup-linux-amd64 start node`.
   * It starts automatically when Supervisor launches and has a**priority of 1** , meaning it will be started before other processes.
   * The logs are written to`/var/log/pastelup.log`.
   * `autorestart=false` ensures the service will not restart automatically if it stops.
2. **redis** :
   * The Redis service is started using`redis-server`.
   * Redis is essential for the**s-nomp** mining pool, and it starts with**priority 1** , alongside`pasteld`.
   * Logs for Redis are located in`/var/log/redis.log` and errors in`/var/log/redis.err.log`.
   * Redis is set to`autorestart=true` to ensure it automatically restarts if it fails.
3. **rpc_run_once** :
   * This script is designed to run**once** after`pasteld` has started and synced.
   * `autostart=false`: It is not automatically started; it will only start after`pasteld` has been running for 30 seconds.
   * The script will check if the Pastel node is synced and will then import the private keys for the reward addresses. Once complete, it deletes itself to ensure it doesn't run again.
   * Logs are written to`/var/log/rpc_run_once.log`.
   * This process has a**priority of 2** , so it runs after`pasteld` but before the validator or mining pool.
4. **mining_validator** :
   * The`start_validator.sh` script is used to start the mining block supernode validator.
   * This script starts automatically**after `pasteld`** has been running for 30 seconds, using the same`startsecs` value as`rpc_run_once`.
   * Logs are written to`/var/log/start_mining_validator.log`.
   * It is set with a**priority of 2** , meaning it will start after`pasteld` and alongside`rpc_run_once`.
5. **s-nomp (Stratum Mining Pool)** :
   * The**s-nomp** pool starts by running`node init.js` in the`/root/pastel/s-nomp` directory.
   * It has a**priority of 3** , meaning it will start after both`pasteld` and the`rpc_run_once.sh` script have completed.
   * The process starts**120 seconds** after`pasteld`, allowing time for the node to sync and other dependencies (like Redis) to initialize.
   * Logs are written to`/var/log/snomp.log`.

### Order of Execution:

1. **pasteld** and**Redis** start first (priority 1).
2. **rpc_run_once.sh** and the**mining_validator** start next,**30 seconds** after`pasteld` is up and running (priority 2).
3. **s-nomp** starts last,**120 seconds** after`pasteld` is up (priority 3).

### Log Locations:

* **Pastel Daemon Logs** :`/var/log/pastelup.log`
* **Redis Logs** :`/var/log/redis.log` and`/var/log/redis.err.log`
* **rpc_run_once.sh Logs** :`/var/log/rpc_run_once.log` and`/var/log/rpc_run_once_error.log`
* **Mining Validator Logs** :`/var/log/start_mining_validator.log`
* **s-nomp Logs** :`/var/log/snomp.log`

This sequence ensures that all components are started in the correct order, with `pasteld` initializing first, followed by Redis, and finally the mining validator and `s-nomp`.

## Step 8: Connect Using Pastel Miner

Once the container is running, miners can connect to the **s-nomp** pool using the IP address of the server and port **3255** (default port for Stratum).

### Example:

```bash
stratum+tcp://<your-server-ip>:3255
```

---

This document outlines the complete process for setting up and running a Docker-based mining pool for **Pastel** using **s-nomp**. Let me know if further clarification is needed!

Here’s the revised **Step 7** including instructions on how to start, stop, or kill **pasteld**, **mining_block_supernode_validator**, and **s-nomp pool**.

---

## Step 7: Logs and Troubleshooting

The Docker container uses **Supervisor** to manage the various processes. Logs are generated for each process, and you can monitor their status, troubleshoot issues, and start/stop or kill individual processes if needed. Each log file is stored in `/var/log/` within the container.

### Log Locations:

- **Pastel Daemon Logs**:

  - **Log file**:`/var/log/pastelup.log`
  - Contains logs for the`pasteld` daemon, including startup and sync status.
- **Redis Logs**:

  - **Log file**:`/var/log/redis.log`
  - **Error log**:`/var/log/redis.err.log`
  - Contains logs for the Redis server used by the**s-nomp** pool.
- **rpc_run_once.sh Logs**:

  - **Log file**:`/var/log/rpc_run_once.log`
  - **Error log**:`/var/log/rpc_run_once_error.log`
  - This script imports private keys for reward addresses after`pasteld` syncs.
- **Mining Validator Logs**:

  - **Log file**:`/var/log/start_mining_validator.log`
  - Contains logs for the mining block supernode validator.
- **s-nomp (Stratum Mining Pool) Logs**:

  - **Log file**:`/var/log/snomp.log`
  - Logs for the**s-nomp** mining pool, containing connectivity and job assignment details.

### How to Troubleshoot:

1. **Check Logs**:

   - Review the log files in`/var/log/` to identify errors or warnings for each process.
2. **Inspect Docker Container**:

   - Check the status of the Docker container:
     ```bash
     docker ps
     ```
   - Connect to the running container to investigate further:
     ```bash
     docker exec -it <container_name> /bin/bash
     ```
3. **Verify Pastel Node Sync Status**:

   - Inside the container, use the following command to check the sync status of the**Pastel node**:
     ```bash
     /root/pastel/pastel-cli mnsync status
     ```
   - Look for`"IsSynced": true` in the output to verify that the node is fully synced. If the node isn't syncing, check the**pasteld logs** at`/var/log/pastelup.log`.
4. **Check Redis Status**:

   - Verify that Redis is running:
     ```bash
     redis-cli ping
     ```
   - If Redis is not responding, check`/var/log/redis.err.log` for any errors.
5. **Restarting Services**:

   - You can restart the entire Docker container or specific processes using Supervisor.
   - **To restart the Docker container**:

     ```bash
     docker restart <container_name>
     ```
   - **To restart a specific service within the container**:

     ```bash
     supervisorctl restart <service_name>
     ```

   For example, to restart `pasteld`:

   ```bash
   supervisorctl restart pasteld
   ```
6. **Checking Supervisor Status**:

   - To check the status of all services managed by Supervisor:
     ```bash
     supervisorctl status
     ```
   - This shows the status of all configured services (`pasteld`,`redis`,`rpc_run_once`,`mining_validator`, and`s-nomp`), indicating whether they are running, stopped, or encountered any errors.

---

### Starting/Stopping/Killing Individual Services

You can manually start, stop, or kill individual processes managed by Supervisor using the `supervisorctl` command from within the Docker container.

#### Start/Stop `pasteld`:

- **Start `pasteld`**:

  ```bash
  /root/pastelup-linux-amd64 start node
  ```

  Starts the Pastel daemon if it’s not already running.
- **Stop `pasteld`**:

  ```bash
  /root/pastelup-linux-amd64 stop node
  ```

  Stops the Pastel daemon. Use this if you need to restart it manually.
- **Kill `pasteld`**:
  If `pasteld` is not responding, you can manually kill the process:

  ```bash
  pkill -f pasteld
  ```

#### Start/Stop the Mining Block Supernode Validator:

- **Start the mining validator**:

  ```bash
  supervisorctl start mining_validator
  ```

  This starts the mining block supernode validator.
- **Stop the mining validator**:

  ```bash
  supervisorctl stop mining_validator
  ```

  Stops the validator process.
- **Kill the mining validator**:

  ```bash
  pkill -f start_validator.sh
  ```

#### Start/Stop the `s-nomp` Pool:

- **Start `s-nomp`**:

  ```bash
  supervisorctl start s-nomp
  ```

  This starts the Stratum mining pool using `node init.js`.
- **Stop `s-nomp`**:

  ```bash
  supervisorctl stop s-nomp
  ```

  Stops the Stratum pool.
- **Kill `s-nomp`**:

  ```bash
  pkill -f "node init.js"
  ```

---

### Example Debugging Scenario:

1. **Pastel Node Not Syncing**:

   - Check the**pasteld logs** (`/var/log/pastelup.log`) for any errors.
   - Run`/root/pastel/pastel-cli mnsync status` to check the sync status.
2. **Redis Service Down**:

   - Check`/var/log/redis.err.log` for errors, then restart the Redis service:
     ```bash
     supervisorctl restart redis
     ```
3. **s-nomp Not Running**:

   - Check the**s-nomp logs** (`/var/log/snomp.log`) for any issues.
   - Restart the`s-nomp` process:
     ```bash
     supervisorctl restart s-nomp
     ```

---

This updated section provides instructions for managing individual services within the container, allowing for more precise control over the mining pool and related services. Let me know if anything else needs to be clarified!
