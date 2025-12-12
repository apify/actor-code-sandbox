# Stage 1: Builder - Compile TypeScript to standalone binary with Bun
FROM oven/bun:1 AS builder

# Set working directory
WORKDIR /build

# Copy all source files
COPY . ./

# Install dependencies (including dev dependencies for build)
RUN bun install

# Compile TypeScript to standalone binary with Bun
# This creates a single executable file with Bun runtime embedded
# --minify reduces binary size
# --target=bun-linux-x64 specifies Linux x64 architecture
RUN bun build --compile --minify --target=bun-linux-x64 src/main.ts --outfile sandbox-api

# Stage 2: Runtime - Debian image with Node.js and required sandbox tools
FROM node:24-trixie-slim

# Install required dependencies for sandbox operations
RUN apt-get update && apt-get install -y \
    bash \
    curl \
    wget \
    git \
    python3 \
    python3-pip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install tsx globally for TypeScript execution in execute-code endpoint
RUN npm install -g tsx

# Create sandbox directory for operations
RUN mkdir -p /sandbox && chmod 755 /sandbox

# Set working directory
WORKDIR /app

# Copy only the compiled binary from builder
COPY --from=builder /build/sandbox-api /app/server

# Ensure binary is executable and owned by root
RUN chmod 755 /app/server && chown root:root /app/server

# Run as root user (required for sandbox execution)
USER root

# CRITICAL: Use exec form (square brackets) for ENTRYPOINT
# This makes the binary PID 1 in the container
# If the process is killed/crashes, the entire container exits
ENTRYPOINT ["/app/server"]
