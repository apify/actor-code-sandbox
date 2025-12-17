# Apify code sandbox

Isolated sandbox for running AI coding operations in a containerized environment. 🚀

## Use cases

- **🔒 Execute untrusted code safely:** Run potentially unsafe code in an isolated container with controlled resources and security boundaries
- **🤖 AI agent development:** Provide isolated and managed development environments where AI agents can code, test, and execute operations securely
- **📦 Sandboxed operations:** Execute system commands, file operations, and custom scripts in a contained environment
- **🖥️ Interactive debugging:** Access the sandbox via browser-based shell terminal for real-time exploration and troubleshooting

## How to run

### Start the Actor

1. Run it on the Apify platform through the [Console](https://console.apify.com/)
2. Check the Actor run log console for connection details (host, port, MCP endpoint URL)

### Connect to the sandbox

Once the Actor is running, you can interact with it in three ways:

#### MCP Client

Use a Model Context Protocol (MCP) client to interact with this sandbox. See [modelcontextprotocol.io/clients](https://modelcontextprotocol.io/clients)

**Connect with Claude code:**

```bash
claude mcp add --transport http sandbox https://YOUR-RUN-ID.runs.apify.net/mcp
```

Replace `YOUR-RUN-ID` with the actual run ID from your Actor execution (found in the logs).

#### REST API

Access the sandbox directly via REST API endpoints. The complete list of available endpoints and their required arguments are documented in the Actor run logs.

**Health Status:** Use the `GET /health` endpoint to check the Actor's readiness:

- `status: "initializing"` (HTTP 503) - Actor is still setting up dependencies and running init script
- `status: "unhealthy"` (HTTP 503) - Init script failed, check logs for details
- `status: "healthy"` (HTTP 200) - Actor is ready to accept requests

#### Interactive Shell Terminal

Access an interactive shell terminal in your browser at `https://YOUR-RUN-ID.runs.apify.net/shell` (replace with your actual run ID).

## Configuration

- **Memory & timeout:** Configure run options to set memory allocation and execution timeout
- **Request timeout:** All requests to the Actor have a 5-minute timeout ceiling. All operations (code execution, commands, file operations) must complete within this time limit. The `timeout` parameter in requests cannot exceed this 5-minute window
- **Check logs:** Open the Actor run log console to view connection details and operation output

## Sandbox Environment Structure

The sandbox runs on a **Debian Trixie** container image with **Node.js 24**, **Python 3**, and essential development tools pre-installed.

The sandbox provides isolated execution environments for different code languages:

### Code Execution Directories

- **Python**: `/sandbox/py`
    - Python code executes in this isolated directory
    - Has access to Python virtual environment at `/sandbox/py/venv`
    - All pip packages installed in the venv

- **JavaScript/TypeScript**: `/sandbox/js-ts`
    - JS/TS code executes in this isolated directory
    - Has access to node_modules at `/sandbox/js-ts/node_modules`
    - All npm packages installed in node_modules

- **General Commands**: `/sandbox` (root)
    - Shell commands via `/exec` endpoint run from sandbox root
    - Can access all subdirectories

### Dependency Installation

Specify dependencies to install via Actor input:

- **Node.js Dependencies**: npm packages for JS/TS code execution in native npm format
    - Input as a JSON object: `{"package-name": "version", ...}`
    - Example: `{"zod": "^3.0", "axios": "latest", "lodash": "4.17.21"}`
- **Python Requirements**: pip packages for Python code execution in requirements.txt format
    - Input as multi-line text: one package per line with optional version specifiers
    - Example:
        ```
        requests==2.31.0
        pandas>=2.0.0
        numpy
        ```

Dependencies are installed during Actor startup before any code execution, allowing your code to immediately use them.

### Customization with Init Script

Provide a bash script via the "Initialization Script" input to customize the sandbox:

- Runs **after** library installation
- Executes in `/sandbox` directory
- Can install system packages, create directories, set permissions, etc.
- Errors are logged but don't prevent Actor from starting
- **Note:** Init scripts have a 5-minute execution timeout

**Example init scripts:**

```bash
# Install system package
apt-get update && apt-get install -y curl

# Create custom directory with permissions
mkdir -p /sandbox/custom-data && chmod 755 /sandbox/custom-data
```

## Learn more

- [Apify Actor documentation](https://docs.apify.com/platform/actors)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Apify SDK reference](https://docs.apify.com/sdk)
