FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Update package list and install required tools
RUN apt-get update && apt-get install -y \
    software-properties-common \
    curl \
    wget \
    build-essential \
    git \
	tmux \
	redis-server \
	jq \
	crudini \
	dos2unix \
	supervisor \
    mc

# Copy docker-config.ini to the image
COPY docker-config.ini /root/docker-config.ini

# Convert docker-config.ini to Unix format in case it was created in Windows
RUN dos2unix /root/docker-config.ini

# Install Python 3.10.x and pip
RUN add-apt-repository ppa:deadsnakes/ppa && \
    apt-get update && \
    apt-get install -y python3.10 python3.10-dev python3-pip

# Set Python 3.10 as default
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.10 1

# Upgrade pip
RUN python3 -m pip install --upgrade pip

# Install Node.js 20.17.0
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs=20.17.0-1nodesource1

# Install Rust (required for Node.js native modules)
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# Build argument to accept the network type (devnet, testnet, mainnet)
ARG NETWORK=mainnet
ENV NETWORK=$NETWORK

WORKDIR /root/pastel

# Clone the s-nomp repository
RUN git clone https://github.com/pastelnetwork/s-nomp-pastel.git /root/pastel/s-nomp

# Copy local files for s-nomp
COPY files/s-nomp /root/pastel/s-nomp

# Clone the mining_block_supernode_validator repository
RUN git clone https://github.com/pastelnetwork/mining_block_supernode_validator.git /root/pastel/mining_block_supernode_validator

# Install Python dependencies for mining_block_supernode_validator
WORKDIR /root/pastel/mining_block_supernode_validator
RUN pip install -r requirements.txt

# Install Node.js dependencies for s-nomp
WORKDIR /root/pastel/s-nomp
RUN npm install

# Copy local files for mining_block_supernode_validator
COPY files/mining_block_supernode_validator /root/pastel/mining_block_supernode_validator

EXPOSE 3255 9997 8080

# Print the network type for confirmation
RUN echo "Building for network: $NETWORK"

# Download pastelup installer
WORKDIR /root
RUN wget https://download.pastel.network/latest-release/pastelup/pastelup-linux-amd64 \
    && chmod +x pastelup-linux-amd64

# Define common pastelup parameters (common for all networks)
ENV PASTELUP_COMMON_FLAGS="install node --quiet --extra-flags txindex=1"

# Install pasteld based on the network type
RUN if [ "$NETWORK" = "mainnet" ]; then \
        ./pastelup-linux-amd64 $PASTELUP_COMMON_FLAGS --network mainnet \
        --force --use-snapshot --snapshot-name snapshot-latest-mainnet-txind.tar.zst \
        --peers 18.218.28.57,18.220.120.83,3.141.226.93; \
    elif [ "$NETWORK" = "devnet" ]; then \
        ./pastelup-linux-amd64 $PASTELUP_COMMON_FLAGS --network devnet \
        --peers 144.126.137.164; \
    elif [ "$NETWORK" = "testnet" ]; then \
        ./pastelup-linux-amd64 $PASTELUP_COMMON_FLAGS --network testnet \
        --peers 154.12.235.41,154.12.235.19; \
    else \
        echo "Unknown network type: $NETWORK"; \
        exit 1; \
    fi

# Copy local files for pasteld
COPY files/pasteld /root/.pastel

# Copy the configure.sh script to the image
COPY scripts/configure.sh /root/configure.sh
RUN chmod +x /root/configure.sh

COPY scripts/rpc_run_once.sh /root/pastel/rpc_run_once.sh
RUN chmod +x /root/pastel/rpc_run_once.sh

# Copy the validator startup script
COPY scripts/start_validator.sh /root/start_validator.sh
RUN chmod +x /root/start_validator.sh

# Copy the supervisord configuration file
COPY scripts/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Run the configure.sh script
RUN /root/configure.sh
	
# Set bash as the default shell
SHELL ["/bin/bash", "-c"]

# Set the CMD to start supervisord on container startup
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]

