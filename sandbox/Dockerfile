# Use Debian base image with Node.js
FROM node:22-bookworm AS builder

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install all dependencies including dev dependencies
RUN npm install --include=dev --audit=false

# Copy source files
COPY . ./

# Build the project
RUN npm run build

# Create final image
FROM node:22-bookworm

# Set working directory
WORKDIR /usr/src/app

# Install common development tools that might be needed in sandbox
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    vim \
    nano \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm install --omit=dev --omit=optional --audit=false \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version \
    && rm -rf ~/.npm

# Copy built JS files from builder image
COPY --from=builder /usr/src/app/dist ./dist

# Copy remaining files
COPY . ./

# Run as root user (for sandbox execution)
USER root

# Run the application
CMD npm run start:prod --silent
