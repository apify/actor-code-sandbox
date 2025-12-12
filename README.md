# Apify Actor sandbox

Isolated sandbox for running AI coding operations in a containerized environment. 🚀

## Use cases

* **🔒 Execute untrusted code safely:** Run potentially unsafe code in an isolated container with controlled resources and security boundaries
* **🤖 AI agent development:** Provide isolated and managed development environments where AI agents can code, test, and execute operations securely
* **📦 Sandboxed operations:** Execute system commands, file operations, and custom scripts in a contained environment

## How to use

* **Connect with MCP client:** Use a Model Context Protocol (MCP) client to interact with this sandbox. See [modelcontextprotocol.io/clients](https://modelcontextprotocol.io/clients)
* **Use Apify SDK:** Connect programmatically using the Apify SDK for direct integration
* **REST API:** Access the sandbox directly via REST API endpoints

### Connect with Claude code

To connect this sandbox to Claude code client, run:

```bash
claude mcp add --transport http sandbox https://YOUR-RUN-ID.runs.apify.net/mcp
```

Replace `YOUR-RUN-ID` with the actual run ID from your Actor execution.

## Configuration

* **Memory & timeout:** Configure run options to set memory allocation and execution timeout
* **Check logs:** Open the Actor run log console to view connection details and operation output

## Running this Actor

To use the sandbox, you first need to run the Actor:

1. Run it on the Apify platform through the [Console](https://console.apify.com/)
2. Check the Actor run log console for connection details (host, port, MCP endpoint)
3. Use it via the Apify SDK with your preferred language
4. Connect it to an MCP client for AI agent integration or call it via REST API for programmatic access

## Learn more

* [Apify Actor documentation](https://docs.apify.com/platform/actors)
* [Model Context Protocol](https://modelcontextprotocol.io/)
* [Apify SDK reference](https://docs.apify.com/sdk)
