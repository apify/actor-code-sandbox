import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Actor } from 'apify';
import type { Request, Response } from 'express';
import express from 'express';
import { ApifyClient } from 'apify-client';

import { createMcpServer, getSandboxes } from './mcp.js';

// The init() call configures the Actor for its environment. It's recommended to start every Actor with an init()
await Actor.init();

// Create Express app - use plain Express to avoid host validation issues on Apify platform
const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'healthy' });
});

// Apify standby readiness probe at root path
app.get('/', (req: Request, res: Response) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    if (req.headers['x-apify-container-server-readiness-probe']) {
        console.log('Readiness probe');
        res.end('Readiness probe OK\n');
    } else {
        console.log('Normal request to root');
        res.end('Manager Actor MCP Server\n');
    }
});

// MCP endpoint using proper StreamableHTTPServerTransport
app.post('/mcp', async (req: Request, res: Response) => {
    const server = createMcpServer();
    try {
        const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        res.on('close', () => {
            console.log('MCP request closed');
            void transport.close();
            void server.close();
        });
    } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error',
                },
                id: null,
            });
        }
    }
});

// GET and DELETE not allowed on MCP endpoint
app.get('/mcp', async (_req: Request, res: Response) => {
    console.log('Received GET MCP request');
    res.writeHead(405).end(
        JSON.stringify({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Method not allowed.',
            },
            id: null,
        }),
    );
});

app.delete('/mcp', async (_req: Request, res: Response) => {
    console.log('Received DELETE MCP request');
    res.writeHead(405).end(
        JSON.stringify({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Method not allowed.',
            },
            id: null,
        }),
    );
});

// Get the port from environment variable or Actor config or use default
const port = parseInt(process.env.ACTOR_WEB_SERVER_PORT || '', 10) || Actor.config.get('standbyPort') || 3000;

/**
 * Function to cleanup all managed sandboxes
 */
const cleanupSandboxes = async () => {
    const sandboxes = getSandboxes();
    if (sandboxes.size === 0) {
        console.log('No sandboxes to cleanup');
        return;
    }

    console.log(`Cleaning up ${sandboxes.size} sandbox(es)...`);
    const apifyClient = new ApifyClient({
        token: process.env.APIFY_TOKEN,
    });

    for (const [sandboxId, sandbox] of sandboxes.entries()) {
        try {
            console.log(`Aborting sandbox ${sandboxId}...`);
            await apifyClient.run(sandbox.runId).abort();
            console.log(`Sandbox ${sandboxId} aborted successfully`);
        } catch (error) {
            const err = error as Error;
            console.error(`Error aborting sandbox ${sandboxId}: ${err.message}`);
        }
    }

    console.log('Sandbox cleanup completed');
};

// Start server
app.listen(port, () => {
    console.log(`Manager Actor MCP server listening on port ${port}`);
});

// Handle Actor exit event
Actor.on('exit', async () => {
    console.log('Actor exit event triggered, cleaning up sandboxes...');
    await cleanupSandboxes();
});

// Handle Actor abort event
Actor.on('aborting', async () => {
    console.log('Actor aborting event triggered, cleaning up sandboxes...');
    await cleanupSandboxes();
});

// Handle server shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    await cleanupSandboxes();
    process.exit(0);
});
