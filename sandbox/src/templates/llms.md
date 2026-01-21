# Apify AI Sandbox

Containerized sandbox environment for AI coding operations. Connect through HTTP, MCP, or the interactive shell.

## Quick links

- **Shell terminal**: <%= serverUrl %>/shell/
- **Health check**: <%= serverUrl %>/health
- **MCP endpoint**: <%= serverUrl %>/mcp

## Connect with MCP

```bash
claude mcp add --transport http sandbox <%= serverUrl %>/mcp
```

## Core HTTP endpoints

### Execute commands or code

**POST** `<%= serverUrl %>/exec`

Run shell commands or execute code snippets.

**Shell command:**

```json
{
    "command": "ls -la",
    "cwd": "/sandbox",
    "timeoutSecs": 5
}
```

**Code execution:**

```json
{
    "command": "print('hello')",
    "language": "py",
    "timeoutSecs": 10
}
```

**Supported languages:** `js`, `javascript`, `ts`, `typescript`, `py`, `python`, `bash`, `sh` (or omit for shell)

## Filesystem endpoints

Direct file operations using HTTP methods. All paths relative to `/sandbox`.

- **GET** `/fs/{path}` - Read file or list directory
    - Query: `?download=1` for ZIP download of directories
    - Example: `GET /fs/app/log.txt` or `GET /fs/app?download=1`

- **PUT** `/fs/{path}` - Write/replace file (raw body)
    - Example: `PUT /fs/config.json` with JSON body

- **POST** `/fs/{path}?mkdir=1` - Create directory
    - Example: `POST /fs/project/src?mkdir=1`

- **POST** `/fs/{path}?append=1` - Append to file (raw body)
    - Example: `POST /fs/log.txt?append=1` with text body

- **DELETE** `/fs/{path}` - Delete file or directory
    - Query: `?recursive=1` for directories
    - Example: `DELETE /fs/temp?recursive=1`

- **HEAD** `/fs/{path}` - Get file metadata (headers only)
    - Returns: Content-Type, Content-Length, Last-Modified, etc.
    - Example: `HEAD /fs/data.json`

## Code examples

### TypeScript/Node.js

```typescript
const baseUrl = '<%= serverUrl %>';
const res = await fetch(`${baseUrl}/exec`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
        command: 'print("hello")',
        language: 'py',
        timeoutSecs: 10,
    }),
});
const json = await res.json();
console.log(json);
```

### Python

```python
import requests

base_url = "<%= serverUrl %>"
payload = {
    "command": "print('hello')",
    "language": "py",
    "timeoutSecs": 10
}
resp = requests.post(f"{base_url}/exec", json=payload, timeout=15)
resp.raise_for_status()
print(resp.json())
```

## Response format

All `/exec` requests return:

```json
{
    "stdout": "string",
    "stderr": "string",
    "exitCode": 0,
    "language": "shell|js|ts|py"
}
```

## Working directories

- Shell commands: `/sandbox` (default)
- JavaScript/TypeScript: `/sandbox/js-ts` (default)
- Python: `/sandbox/py` (default)
- Override with `cwd` parameter (must be within `/sandbox`)

## Configuration

- **Idle Timeout**: The container automatically shuts down after inactivity (default 10m).
- **Execution Timeout**: Recommended to set to 0 (infinite) on the platform; use the `idleTimeoutSeconds` input to control lifecycle.
