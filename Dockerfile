# Stage 1: Builder - Compile TypeScript and ttyd
FROM node:24-trixie-slim AS builder

# Install build tools and dependencies for ttyd
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    libjson-c-dev \
    libwebsockets-dev \
    python3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Build ttyd from source
RUN git clone --depth 1 https://github.com/tsl0922/ttyd.git /tmp/ttyd \
    && cd /tmp/ttyd && mkdir build && cd build \
    && cmake .. \
    && make && make install

# Set working directory
WORKDIR /build

# Copy all source files
COPY . ./

# Install all dependencies (including dev dependencies for build)
RUN npm install

# Compile TypeScript to JavaScript
RUN npm run build

# Stage 2: Runtime - Node.js image
FROM node:24-trixie-slim

# Install required dependencies for sandbox operations
RUN apt-get update && apt-get install -y \
    bash \
    curl \
    wget \
    git \
    python3 \
    python3-venv \
    python3-pip \
    ca-certificates \
    libjson-c-dev \
    libwebsockets-dev \
    libsecret-1-0 \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install tsx globally for TypeScript execution in execute-code endpoint
RUN npm install -g tsx

# Install Apify CLI globally
RUN npm install -g apify-cli

# Install Apify MCP CLI globally (package: @apify/mcpc, binary: mcpc)
RUN npm install -g @apify/mcpc

# Install Claude Code CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# Install OpenCode CLI
RUN curl -fsSL https://opencode.ai/install | bash

# Create sandbox directory for operations
RUN mkdir -p /sandbox && chmod 755 /sandbox

# Set working directory
WORKDIR /app

# Copy compiled dist folder from builder
COPY --from=builder /build/dist /app/dist

# Copy ttyd binary from builder
COPY --from=builder /usr/local/bin/ttyd /usr/local/bin/ttyd

# Copy package.json and production node_modules from builder
COPY --from=builder /build/package.json /app/package.json
COPY --from=builder /build/package-lock.json /app/package-lock.json

# Copy OpenCode configuration
RUN mkdir -p /root/.config/opencode
COPY --from=builder /build/.opencode/opencode.json /root/.config/opencode/opencode.json

# Install production dependencies only
RUN npm install --production

# Capture tool versions at build time for fast shell startup
COPY scripts/capture-versions.sh /tmp/capture-versions.sh
RUN chmod +x /tmp/capture-versions.sh && /tmp/capture-versions.sh && rm /tmp/capture-versions.sh

# Run as root user (required for sandbox execution)
USER root

# Use Node.js to execute the compiled application
ENTRYPOINT ["node", "/app/dist/main.js"]
