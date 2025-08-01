FROM ubuntu:focal

# Use non-interactive mode to avoid tzdata prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    dos2unix \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    software-properties-common \
    unzip

# Install Node.js (v20)
RUN curl -sL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

# Install Docker Engine (for buildx functionality)
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg && \
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null && \
    apt-get update && \
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Install AWS CLI v2
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" && \
    unzip awscliv2.zip && \
    ./aws/install && \
    rm -rf awscliv2.zip aws

# Reset DEBIAN_FRONTEND (optional, good hygiene)
ENV DEBIAN_FRONTEND=dialog

# Set working directory
WORKDIR /home/app

# Copy application files
COPY main.sh deploy.sh package*.json ./
COPY src/ ./src/

# Fix line endings and set permissions
RUN dos2unix main.sh deploy.sh && \
    chmod +x main.sh deploy.sh

# Install Node.js dependencies
RUN npm install

# Set entrypoint to run build server
ENTRYPOINT ["/home/app/main.sh"]
