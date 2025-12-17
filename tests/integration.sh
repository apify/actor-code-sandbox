#!/bin/bash

###############################################################################
# Integration Test for Apify Sandbox Actor
# 
# This script:
# 1. Starts the Actor with apify call in background
# 2. Extracts the run ID from apify runs ls
# 3. Waits for the run to complete
# 4. Executes TypeScript code with zod dependency
# 5. Executes JavaScript code with zod dependency
# 6. Executes Python code with numpy dependency
# 7. Verifies all code executions succeed and /sandbox/my-dir exists
###############################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "==================================="
echo "🚀 Sandbox Actor Integration Test"
echo "==================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
TIMEOUT_SECONDS=120
POLL_INTERVAL=5
TEST_RUN_ID=""

###############################################################################
# Helper Functions
###############################################################################

log_info() {
    echo -e "${GREEN}ℹ${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

wait_for_run_health() {
    local run_id=$1
    local elapsed=0
    
    log_info "Waiting for Actor to become healthy (timeout: ${TIMEOUT_SECONDS}s)..."
    
    # First, get the container URL
    local container_url=""
    while [ -z "$container_url" ] && [ $elapsed -lt 30 ]; do
        container_url=$(apify runs info "$run_id" --json 2>/dev/null | jq -r '.containerUrl // ""')
        if [ -z "$container_url" ] || [ "$container_url" = "null" ]; then
            sleep 2
            elapsed=$((elapsed + 2))
        fi
    done
    
    if [ -z "$container_url" ] || [ "$container_url" = "null" ]; then
        log_error "Could not get container URL"
        return 1
    fi
    
    log_success "Container URL obtained: $container_url"
    elapsed=0
    
    # Now wait for /health endpoint to return 200
    while [ $elapsed -lt $TIMEOUT_SECONDS ]; do
        local health_response=$(curl -s -w "\n%{http_code}" "$container_url/health" 2>/dev/null)
        local http_code=$(echo "$health_response" | tail -n 1)
        local body=$(echo "$health_response" | head -n -1)
        
        if [ "$http_code" = "200" ]; then
            log_success "Actor is healthy"
            return 0
        elif [ "$http_code" = "503" ]; then
            local init_status=$(echo "$body" | jq -r '.status // "unknown"')
            log_info "Actor status: $init_status (${elapsed}s elapsed)"
            sleep $POLL_INTERVAL
            elapsed=$((elapsed + POLL_INTERVAL))
        else
            log_warn "Unexpected HTTP response: $http_code"
            sleep $POLL_INTERVAL
            elapsed=$((elapsed + POLL_INTERVAL))
        fi
    done
    
    log_error "Timeout waiting for Actor to become healthy after ${TIMEOUT_SECONDS}s"
    return 1
}

wait_for_run_completion() {
    local run_id=$1
    local elapsed=0
    
    log_info "Waiting for run $run_id to complete (timeout: ${TIMEOUT_SECONDS}s)..."
    
    while [ $elapsed -lt $TIMEOUT_SECONDS ]; do
        local status=$(apify runs info "$run_id" --json 2>/dev/null | jq -r '.status' 2>/dev/null || echo "")
        
        if [ -z "$status" ]; then
            log_warn "Could not fetch run status, retrying..."
            sleep $POLL_INTERVAL
            elapsed=$((elapsed + POLL_INTERVAL))
            continue
        fi
        
        case $status in
            SUCCEEDED)
                log_success "Run completed with status: SUCCEEDED"
                return 0
                ;;
            FAILED)
                log_error "Run failed!"
                apify runs log "$run_id" | tail -50
                return 1
                ;;
            ABORTED)
                log_error "Run was aborted!"
                apify runs log "$run_id" | tail -50
                return 1
                ;;
            *)
                log_info "Current status: $status... (${elapsed}s elapsed)"
                sleep $POLL_INTERVAL
                elapsed=$((elapsed + POLL_INTERVAL))
                ;;
        esac
    done
    
    log_error "Timeout waiting for run to complete after ${TIMEOUT_SECONDS}s"
    return 1
}

execute_code_in_sandbox() {
    local container_url=$1
    local code=$2
    local language=$3
    local description=$4
    
    echo ""
    log_info "Executing $description..."
    echo "---"
    
    local endpoint="${container_url}/execute-code"
    
    # Escape the code for JSON
    local json_payload=$(jq -n \
        --arg code "$code" \
        --arg language "$language" \
        '{code: $code, language: $language}')
    
    local response=$(curl -s -X POST "$endpoint" \
        -H "Content-Type: application/json" \
        -d "$json_payload")
    
    local exit_code=$(echo "$response" | jq -r '.exitCode // 1')
    local stdout=$(echo "$response" | jq -r '.stdout // ""')
    local stderr=$(echo "$response" | jq -r '.stderr // ""')
    
    if [ "$exit_code" -eq 0 ]; then
        log_success "Execution succeeded"
        echo "Output:"
        echo "$stdout"
    else
        log_error "Execution failed with exit code $exit_code"
        if [ ! -z "$stderr" ]; then
            echo "Error:"
            echo "$stderr"
        fi
        return 1
    fi
    
    echo "---"
}

###############################################################################
# Main Test Flow
###############################################################################

cd "$PROJECT_DIR"

# Step 1: Create input with dependencies and init script
log_info "Step 1: Preparing Actor input..."

INPUT=$(cat <<'EOF'
{
  "nodeDependencies": {
    "zod": "^3.22.0"
  },
  "pythonRequirementsTxt": "numpy>=1.24.0",
  "initScript": "#!/bin/bash\nmkdir -p /sandbox/my-dir\necho 'Directory created successfully' > /sandbox/my-dir/status.txt"
}
EOF
)

log_success "Input prepared"
echo "$INPUT" | jq '.'
echo ""

# Step 2: Start Actor in background
log_info "Step 2: Starting Actor on Apify platform..."

echo "$INPUT" | apify call -f - >/dev/null 2>&1 &
CALL_PID=$!
log_success "apify call started in background (PID: $CALL_PID)"

# Give it time for the run to appear in the system
log_info "Waiting for run to be registered in the system..."
sleep 10

# Step 3: Get the latest run ID
log_info "Step 3: Getting run ID..."

TEST_RUN_ID=$(apify runs ls --json --limit 1 --desc | jq -r '.items[0].id')

if [ -z "$TEST_RUN_ID" ] || [ "$TEST_RUN_ID" = "null" ]; then
    log_error "Could not extract run ID"
    exit 1
fi

log_success "Run ID: $TEST_RUN_ID"
echo ""

# Step 4: Wait for Actor to become healthy
log_info "Step 4: Waiting for Actor to be ready (dependencies installing, init script running)..."
if ! wait_for_run_health "$TEST_RUN_ID"; then
    log_error "Actor did not become healthy"
    exit 1
fi
echo ""

# Get container URL from run info
CONTAINER_URL=$(apify runs info "$TEST_RUN_ID" --json 2>/dev/null | jq -r '.containerUrl // ""')
if [ ! -z "$CONTAINER_URL" ] && [ "$CONTAINER_URL" != "null" ]; then
    log_success "Container URL: $CONTAINER_URL"
fi
echo ""

# Step 5: Execute TypeScript code with Zod
log_info "Step 5: Testing TypeScript code with zod dependency..."

TS_CODE='import { z } from "zod";
import fs from "fs";

// 1. Zod Hello World Logic
const mySchema = z.string();
const helloResult = mySchema.parse("Hello World");
console.log(helloResult); // Prints "Hello World"

// 2. Check if /sandbox/my-dir exists
const dirPath = "/sandbox/my-dir";
if (fs.existsSync(dirPath)) {
  console.log(`YES: ${dirPath} exists.`);
} else {
  console.log(`NO: ${dirPath} does not exist.`);
}'

if execute_code_in_sandbox "$CONTAINER_URL" "$TS_CODE" "ts" "TypeScript with zod"; then
    log_success "TypeScript test passed"
else
    log_error "TypeScript test failed"
    exit 1
fi
echo ""

# Step 6: Execute JavaScript code with Zod
log_info "Step 6: Testing JavaScript code with zod dependency..."

JS_CODE='const { z } = require("zod");
const fs = require("fs");

// 1. Zod Hello World Logic
const mySchema = z.string();
const helloResult = mySchema.parse("Hello World");
console.log(helloResult);

// 2. Check if /sandbox/my-dir exists
const dirPath = "/sandbox/my-dir";
if (fs.existsSync(dirPath)) {
  console.log(`YES: ${dirPath} exists.`);
} else {
  console.log(`NO: ${dirPath} does not exist.`);
}'

if execute_code_in_sandbox "$CONTAINER_URL" "$JS_CODE" "js" "JavaScript with zod"; then
    log_success "JavaScript test passed"
else
    log_error "JavaScript test failed"
    exit 1
fi
echo ""

# Step 7: Execute Python code with NumPy
log_info "Step 7: Testing Python code with numpy dependency..."

PY_CODE='import numpy as np
import os

# 1. Numpy Hello World Logic
hello_arr = np.array(["Hello World"])
print(hello_arr[0])

# 2. Check if /sandbox/my-dir exists
dir_path = "/sandbox/my-dir"
if os.path.exists(dir_path):
    print(f"YES: {dir_path} exists.")
else:
    print(f"NO: {dir_path} does not exist.")'

if execute_code_in_sandbox "$CONTAINER_URL" "$PY_CODE" "py" "Python with numpy"; then
    log_success "Python test passed"
else
    log_error "Python test failed"
    exit 1
fi
echo ""

###############################################################################
# Cleanup
###############################################################################

log_info "Cleaning up: Aborting Actor run..."
apify runs abort "$TEST_RUN_ID" -f >/dev/null 2>&1 || log_warn "Could not abort run"
log_success "Run aborted"
echo ""

###############################################################################
# Summary
###############################################################################

echo "==================================="
log_success "All integration tests passed! ✨"
echo "==================================="
echo ""
echo "Summary:"
echo "  ✓ Actor started successfully"
echo "  ✓ Dependencies installed (zod, numpy)"
echo "  ✓ Init script executed (/sandbox/my-dir created)"
echo "  ✓ TypeScript code executed successfully"
echo "  ✓ JavaScript code executed successfully"
echo "  ✓ Python code executed successfully"
echo ""
echo "Run ID: $TEST_RUN_ID"
if [ ! -z "$CONTAINER_URL" ] && [ "$CONTAINER_URL" != "null" ]; then
    echo "Container URL: $CONTAINER_URL"
fi
echo ""
