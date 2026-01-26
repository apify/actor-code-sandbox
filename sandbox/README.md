# Apify AI Sandbox

Isolated sandbox for running AI coding operations in a containerized environment. 🚀

## Use cases

- **🔒 Execute untrusted code safely:** Run potentially unsafe code in an isolated container with controlled resources and security boundaries
- **🤖 AI agent development:** Provide isolated and managed development environments where AI agents can code, test, and execute operations securely
- **📦 Sandboxed operations:** Execute system commands, file operations, and custom scripts in a contained environment
- **🖥️ Interactive debugging:** Access the sandbox via browser-based shell terminal for real-time exploration and troubleshooting
- **🌐 Interactive browser:** Use the integrated Firefox browser (via noVNC) to interact with local web apps, test UIs, and debug frontend applications visually
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

### MCP client

Use a Model Context Protocol (MCP) client to interact with this sandbox. See [modelcontextprotocol.io/clients](https://modelcontextprotocol.io/clients).

**Connect with Claude Code:**

```bash
claude mcp add --transport http sandbox https://UNIQUE-ID.runs.apify.net/mcp
```

Replace `UNIQUE-ID` with the run ID from your Actor execution (URL is also in the landing page and logs). Then prompt your agent; it will use the sandbox tools automatically over MCP.

### REST API

Available endpoints (all URLs come from the run logs/landing page):

#### Core endpoints

- `POST /mcp`
    - Body: JSON-RPC over HTTP per MCP client
    - Returns: JSON-RPC response

- `POST /exec`
    - Execute shell commands OR code snippets (JavaScript, TypeScript, Python)
    - Body: `{ command: string; language?: string; cwd?: string; timeoutSecs?: number }`
    - Language options: `"js"`, `"javascript"`, `"ts"`, `"typescript"`, `"py"`, `"python"`, `"bash"`, `"sh"` (omit for shell)
    - Returns (200 on success, 500 on error): `{ stdout: string; stderr: string; exitCode: number; language: string }`
    - The `language` field in response is always present: `"shell"` for shell commands, `"js"`/`"ts"`/`"py"` for code

- `GET /health`
    - Health check endpoint
    - Returns (200/503): `{ status: 'healthy' | 'initializing' | 'unhealthy'; message?: string }`

- `GET /shell/`
    - Interactive browser terminal
    - Returns: Interactive terminal powered by ttyd

- `GET /browser/vnc.html?autoconnect=true`
    - In-browser Firefox via noVNC
    - Returns: Interactive VNC client with autoconnect to Firefox
    - Supports full browser automation and UI testing

- `GET /llms.txt`
    - Markdown documentation for LLMs (same usage info as landing page)
    - Returns (200): Plain text Markdown with all endpoint documentation

**Health status:**

- `status: "initializing"` (503) – dependencies/setup still running
- `status: "unhealthy"` (503) – init script failed; check logs
- `status: "healthy"` (200) – ready for requests

#### RESTful filesystem endpoints

Direct filesystem access using standard HTTP methods. All paths are relative to `/sandbox`.

- `GET /fs/{path}`
    - **Read file**: Returns raw file bytes with appropriate `Content-Type` header
    - **List directory**: Returns JSON with directory contents (files and subdirectories with sizes)
    - Query params:
        - `?download=1`: Download file as attachment (or directory as ZIP)
    - Returns (200): File content or directory JSON, (404): Path not found

- `PUT /fs/{path}`
    - **Write/replace file**: Create or replace file with request body content
    - Accepts raw bytes or text in request body
    - Automatically creates parent directories if they don't exist
    - Returns (200): `{ success: true, path: string, size: number }`

- `POST /fs/{path}?mkdir=1`
    - **Create directory**: Create directory at specified path (recursive by default)
    - Returns (201): `{ success: true, path: string, type: "directory" }`

- `POST /fs/{path}?append=1`
    - **Append to file**: Append request body to existing file (creates file if it doesn't exist)
    - Returns (200): `{ success: true, path: string, size: number }`

- `DELETE /fs/{path}`
    - **Delete file or directory**
    - Query params:
        - `?recursive=1`: Enable recursive deletion for non-empty directories
    - Returns (200): `{ success: true, path: string, deleted: true }`, (409): Directory not empty

- `HEAD /fs/{path}`
    - **Get metadata**: Returns file/directory metadata in response headers
    - Headers: `Content-Type`, `Content-Length`, `X-File-Type`, `Last-Modified`, `X-Path`
    - Returns (200): Headers only, (404): Path not found

**Path Resolution**: All `/fs/*` paths are resolved relative to `/sandbox`:

- `/fs/app/main.py` → `/sandbox/app/main.py`
- `/fs/tmp/test.txt` → `/sandbox/tmp/test.txt`

**Security**: Paths are validated to prevent escaping the `/sandbox` directory. Symlinks are followed but validated to stay within `/sandbox`.

**Filesystem examples (curl):**

```bash
# Read a file
curl https://UNIQUE-ID.runs.apify.net/fs/app/config.json

# List directory contents
curl https://UNIQUE-ID.runs.apify.net/fs/app

# Download directory as ZIP
curl https://UNIQUE-ID.runs.apify.net/fs/app?download=1 -o app.zip

# Upload a file
curl -X PUT https://UNIQUE-ID.runs.apify.net/fs/app/config.json \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}'

# Create a directory
curl -X POST https://UNIQUE-ID.runs.apify.net/fs/app/data?mkdir=1

# Append to a log file
curl -X POST https://UNIQUE-ID.runs.apify.net/fs/app/log.txt?append=1 \
  -H "Content-Type: text/plain" \
  -d "New log entry"

# Delete a file
curl -X DELETE https://UNIQUE-ID.runs.apify.net/fs/app/temp.txt

# Delete directory recursively
curl -X DELETE https://UNIQUE-ID.runs.apify.net/fs/app/temp?recursive=1

# Get file metadata
curl -I https://UNIQUE-ID.runs.apify.net/fs/app/data.json
```

**Upload/download files (TypeScript):**

```ts
const baseUrl = 'https://UNIQUE-ID.runs.apify.net';

// Upload a file
const uploadResponse = await fetch(`${baseUrl}/fs/app/document.pdf`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: pdfBuffer, // File buffer or Blob
});

// Download a file
const downloadResponse = await fetch(`${baseUrl}/fs/app/document.pdf`);
const fileBlob = await downloadResponse.blob();

// Download directory as ZIP
const zipResponse = await fetch(`${baseUrl}/fs/app?download=1`);
const zipBlob = await zipResponse.blob();

// List directory
const listResponse = await fetch(`${baseUrl}/fs/app`);
const { entries } = await listResponse.json();
console.log(entries); // [{ name, type, size }, ...]

// Create project structure
await fetch(`${baseUrl}/fs/project/src?mkdir=1`, { method: 'POST' });
await fetch(`${baseUrl}/fs/project/tests?mkdir=1`, { method: 'POST' });
await fetch(`${baseUrl}/fs/project/README.md`, {
    method: 'PUT',
    body: '# My Project',
});
```

**Upload/download files (Python):**

```python
import requests

base_url = "https://UNIQUE-ID.runs.apify.net"

# Upload a file
with open('document.pdf', 'rb') as f:
    resp = requests.put(f"{base_url}/fs/app/document.pdf",
                       data=f,
                       headers={'Content-Type': 'application/pdf'})
    resp.raise_for_status()

# Download a file
resp = requests.get(f"{base_url}/fs/app/document.pdf")
with open('downloaded.pdf', 'wb') as f:
    f.write(resp.content)

# Download directory as ZIP
resp = requests.get(f"{base_url}/fs/app?download=1")
with open('app.zip', 'wb') as f:
    f.write(resp.content)

# List directory
resp = requests.get(f"{base_url}/fs/app")
data = resp.json()
for entry in data['entries']:
    print(f"{entry['name']} ({entry['type']}) - {entry.get('size', 'N/A')} bytes")

# Create project structure
requests.post(f"{base_url}/fs/project/src?mkdir=1")
requests.post(f"{base_url}/fs/project/tests?mkdir=1")
requests.put(f"{base_url}/fs/project/README.md", data=b"# My Project")
```

**Code execution examples (TypeScript/Node):**

```ts
const baseUrl = 'https://UNIQUE-ID.runs.apify.net';

// Execute Python code
const codeRes = await fetch(`${baseUrl}/exec`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
        command: 'print("hello from python")',
        language: 'py',
        timeoutSecs: 10,
    }),
});
console.log(await codeRes.json());

// Execute shell command
const shellRes = await fetch(`${baseUrl}/exec`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
        command: 'ls -la',
        cwd: '/sandbox',
        timeoutSecs: 5,
    }),
});
console.log(await shellRes.json());
```

**Code execution examples (Python):**

```python
import requests

base_url = "https://UNIQUE-ID.runs.apify.net"

# Execute Python code
payload = {"command": "print('hello from python')", "language": "py", "timeoutSecs": 10}
resp = requests.post(f"{base_url}/exec", json=payload, timeout=15)
resp.raise_for_status()
print(resp.json())

# Execute shell command
payload = {"command": "ls -la", "cwd": "/sandbox", "timeoutSecs": 5}
resp = requests.post(f"{base_url}/exec", json=payload, timeout=15)
resp.raise_for_status()
print(resp.json())
```

### Interactive shell terminal

Open the interactive shell terminal URL from the run logs (also linked on the landing page) to work directly in the browser.

### Interactive browser (Firefox via noVNC)

Access Firefox directly in your browser to interact with local web applications and test UIs. The browser runs in a virtual display within the container and is accessible via noVNC WebSocket connection.

**Use cases:**
- Test local web apps running in the container
- Interact with UIs visually for debugging and development
- Verify frontend behavior in real-time
- Quick visual inspection of services

**Connect:**
```
https://UNIQUE-ID.runs.apify.net/browser/vnc.html?autoconnect=true
```

The browser starts ready to navigate. Launch your local web server in the container and open it in Firefox to test.

**Example workflow:**
```bash
# In a code execution or shell session, start a local server:
npx http-server /sandbox/frontend -p 8000

# Then open http://localhost:8000 in the browser at /browser/vnc.html
```

## Configuration

- **Memory & timeout:** Configure run options to set memory allocation and execution timeout
- **Idle timeout:** The container automatically shuts down after a period of inactivity (default: 10 minutes). Activity includes HTTP requests and shell interaction. You can adjust this via the `idleTimeoutSeconds` input.
- **Recommendation:** For cost efficiency, set the standard Actor **Execution Timeout to 0 (infinite)** in the Apify Console. The internal idle logic will then manage the lifecycle based on your usage.
- **Request timeout:** All requests to the Actor have a 5-minute timeout ceiling. All operations (code execution, commands, file operations) must complete within this time limit. The `timeout` parameter in requests cannot exceed this 5-minute window
- **Check logs:** Open the Actor run log console to view connection details and operation output

## Sandbox environment structure

The sandbox runs on a **Debian Trixie** container image with **Node.js 24**, **Python 3**, and essential development tools pre-installed.

The sandbox provides isolated execution environments for different code languages:

### Code execution directories

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

### Dependency installation

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

### Customization with init script

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
