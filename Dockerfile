# Stage 1: Builder - Compile TypeScript with Node.js
FROM node:24-trixie-slim AS builder

# Install build tools and Python for node-gyp (required by node-pty)
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

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
    && rm -rf /var/lib/apt/lists/*

# Install tsx globally for TypeScript execution in execute-code endpoint
RUN npm install -g tsx

# Create sandbox directory for operations
RUN mkdir -p /sandbox && chmod 755 /sandbox

# Set working directory
WORKDIR /app

# Copy compiled dist folder from builder
COPY --from=builder /build/dist /app/dist

# Copy package.json and production node_modules from builder
COPY --from=builder /build/package.json /app/package.json
COPY --from=builder /build/package-lock.json /app/package-lock.json

# Install production dependencies only
RUN npm install --production

# Run as root user (required for sandbox execution)
USER root

# Use Node.js to execute the compiled application
ENTRYPOINT ["node", "/app/dist/main.js"]
