# Apify AI Sandbox

Isolated sandbox for running AI coding operations in a containerized environment. 🚀

## Use cases

- **🔒 Execute untrusted code safely:** Run potentially unsafe code in an isolated container with controlled resources and security boundaries
- **🤖 AI agent development:** Provide isolated and managed development environments where AI agents can code, test, and execute operations securely
- **📦 Sandboxed operations:** Execute system commands, file operations, and custom scripts in a contained environment
- **🖥️ Interactive debugging:** Access the sandbox via browser-based shell terminal for real-time exploration and troubleshooting
- **🔗 Apify Actor orchestration:** Agents can access the limited permissions Apify token (available as `APIFY_TOKEN` env var) to run other [limited permissions Actors](https://docs.apify.com/platform/actors/development/permissions), process or analyze their output, and build complex data pipelines by combining results from multiple Actors

## Quickstart

### Start the Actor

1. Run it on the Apify platform through the [Console](https://console.apify.com/)
2. Check the Actor run log console for connection details (host, port, MCP endpoint URL)
3. Open the landing page link from the run logs for connection details, quick links (shell + health), and endpoint URLs for the current run.

## Ways to connect

Start the Actor (see Quickstart above), then choose how to interact:

- MCP client: Agent-driven access to run code or develop with LLM tooling.
- REST API: Endpoints to run code or shell commands.
- Interactive shell: Browser terminal for manual exploration.

### MCP Client

Use a Model Context Protocol (MCP) client to interact with this sandbox. See [modelcontextprotocol.io/clients](https://modelcontextprotocol.io/clients).

**Connect with Claude code:**

```bash
claude mcp add --transport http sandbox https://YOUR-RUN-ID.runs.apify.net/mcp
```

Replace `YOUR-RUN-ID` with the run ID from your Actor execution (URL is also in the landing page and logs). Then prompt your agent; it will use the sandbox tools automatically over MCP.

### REST API

Available endpoints (all URLs come from the run logs/landing page):

- `POST /mcp`
    - Body: JSON-RPC over HTTP per MCP client
    - Returns: JSON-RPC response

- `POST /exec`
    - Body: `{ command: string; cwd?: string; timeout?: number }`
    - Returns (200 on success, 500 on command error): `{ stdout: string; stderr: string; exitCode: number }`

- `POST /execute-code`
    - Body: `{ code: string; language: 'js' | 'ts' | 'py'; timeout?: number }`
    - Returns (200 on success, 500 on execution error): `{ stdout: string; stderr: string; exitCode: number; language: string }`

- `POST /read-file`
    - Body: `{ path: string }`
    - Returns (200): `{ content: string }` or (404): `{ error: string }`

- `POST /write-file`
    - Body: `{ path: string; content: string; mode?: number }`
    - Returns (200): `{ success: boolean }` or (500): `{ error: string }`

- `POST /list-files`
    - Body: `{ path?: string }`
    - Returns (200): `{ path: string; files: string[] }` or (500): `{ error: string }`

- `GET /health`
    - Returns (200/503): `{ status: 'healthy' | 'initializing' | 'unhealthy'; message?: string }`

- `GET /shell`
    - Returns: HTML page with embedded terminal (WebSocket at `/shell/ws`)

**Health status:**

- `status: "initializing"` (503) – dependencies/setup still running
- `status: "unhealthy"` (503) – init script failed; check logs
- `status: "healthy"` (200) – ready for requests

**Call the API (TypeScript/Node):**

```ts
const baseUrl = 'https://YOUR-RUN-ID.runs.apify.net';
const res = await fetch(`${baseUrl}/execute-code`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'print("hello")', language: 'py', timeout: 10_000 }),
});
const json = await res.json();
console.log(json);
```

**Call the API (Python):**

```python
import requests

base_url = "https://YOUR-RUN-ID.runs.apify.net"
payload = {"code": "print('hello')", "language": "py", "timeout": 10_000}
resp = requests.post(f"{base_url}/execute-code", json=payload, timeout=15)
resp.raise_for_status()
print(resp.json())
```

### Interactive Shell Terminal

Open the interactive shell terminal URL from the run logs (also linked on the landing page) to work directly in the browser.

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
