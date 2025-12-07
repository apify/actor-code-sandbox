// MCP Server implementation for managing sandboxes
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApifyClient } from 'apify-client';
import * as z from 'zod';

// In-memory storage for sandbox instances
interface SandboxInstance {
    id: string;
    runId: string;
    containerUrl?: string;
    createdAt: Date;
    status: 'starting' | 'running' | 'stopped' | 'failed';
}

const sandboxes: Map<string, SandboxInstance> = new Map();

// Initialize Apify client
const apifyClient = new ApifyClient({
    token: process.env.APIFY_TOKEN,
});

/**
 * Export sandboxes map for external access
 */
export const getSandboxes = () => sandboxes;

/**
 * Creates and configures the MCP server with all tools
 */
export const createMcpServer = () => {
    const server = new McpServer(
        {
            name: 'sandbox-manager',
            version: '1.0.0',
        },
        {
            capabilities: {
                tools: {},
            },
        },
    );

    // Register list-sandboxes tool
    server.registerTool(
        'list-sandboxes',
        {
            description: 'Lists all available sandbox instances',
            inputSchema: {},
        },
        async (): Promise<CallToolResult> => {
            const sandboxList = Array.from(sandboxes.values()).map((sandbox) => ({
                sandboxId: sandbox.id,
                containerUrl: sandbox.containerUrl,
                createdAt: sandbox.createdAt.toISOString(),
                status: sandbox.status,
            }));

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(sandboxList, null, 2),
                    },
                ],
            };
        },
    );

    // Register create-sandbox tool
    server.registerTool(
        'create-sandbox',
        {
            description: 'Creates a new sandbox Actor instance and returns its containerUrl',
            inputSchema: {
                options: z.object({}).optional().describe('Optional configuration for the sandbox'),
            },
        },
        async (): Promise<CallToolResult> => {
            try {
                // Get sandbox actor name from environment or use default
                const sandboxActorName = process.env.SANDBOX_ACTOR_NAME || 'sandbox';

                // Start the sandbox Actor (don't wait for it to finish)
                const run = await apifyClient.actor(sandboxActorName).start({
                    waitForFinish: 0, // Don't wait
                });

                // Generate a unique sandbox ID
                const sandboxId = run.id;

                // Store the sandbox instance
                const sandbox: SandboxInstance = {
                    id: sandboxId,
                    runId: run.id,
                    createdAt: new Date(),
                    status: 'starting',
                };
                sandboxes.set(sandboxId, sandbox);

                // Poll for containerUrl (Actor needs to be in RUNNING state)
                let attempts = 0;
                const maxAttempts = 30; // 30 seconds max
                const pollInterval = 1000; // 1 second

                while (attempts < maxAttempts) {
                    const runInfo = await apifyClient.run(run.id).get();

                    if (runInfo?.containerUrl) {
                        sandbox.containerUrl = runInfo.containerUrl;
                        sandbox.status = 'running';
                        sandboxes.set(sandboxId, sandbox);
                        break;
                    }

                    if (runInfo?.status === 'FAILED' || runInfo?.status === 'ABORTED') {
                        sandbox.status = 'failed';
                        sandboxes.set(sandboxId, sandbox);
                        return {
                            content: [
                                {
                                    type: 'text',
                                    text: `Failed to start sandbox: ${runInfo.status}`,
                                },
                            ],
                            isError: true,
                        };
                    }

                    attempts++;
                    await new Promise((resolve) => {
                        setTimeout(resolve, pollInterval);
                    });
                }

                if (!sandbox.containerUrl) {
                    sandbox.status = 'failed';
                    sandboxes.set(sandboxId, sandbox);
                    return {
                        content: [
                            {
                                type: 'text',
                                text: 'Timeout waiting for sandbox containerUrl',
                            },
                        ],
                        isError: true,
                    };
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                {
                                    sandboxId: sandbox.id,
                                    containerUrl: sandbox.containerUrl,
                                    status: sandbox.status,
                                },
                                null,
                                2,
                            ),
                        },
                    ],
                };
            } catch (error) {
                const err = error as Error;
                console.error('Error creating sandbox:', err);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error creating sandbox: ${err.message}`,
                        },
                    ],
                    isError: true,
                };
            }
        },
    );

    // Register destroy-sandbox tool
    server.registerTool(
        'destroy-sandbox',
        {
            description: 'Destroys a sandbox Actor instance by aborting its run',
            inputSchema: {
                sandboxId: z.string().describe('The ID of the sandbox to destroy'),
            },
        },
        async ({ sandboxId }: { sandboxId: string }): Promise<CallToolResult> => {
            try {
                // Get sandbox from storage
                const sandbox = sandboxes.get(sandboxId);
                if (!sandbox) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Sandbox not found: ${sandboxId}`,
                            },
                        ],
                        isError: true,
                    };
                }

                // Abort the Actor run
                await apifyClient.run(sandbox.runId).abort();

                // Update sandbox status
                sandbox.status = 'stopped';
                sandboxes.set(sandboxId, sandbox);

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(
                                {
                                    sandboxId: sandbox.id,
                                    status: sandbox.status,
                                    message: 'Sandbox destroyed successfully',
                                },
                                null,
                                2,
                            ),
                        },
                    ],
                };
            } catch (error) {
                const err = error as Error;
                console.error('Error destroying sandbox:', err);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error destroying sandbox: ${err.message}`,
                        },
                    ],
                    isError: true,
                };
            }
        },
    );

    // Register run-command tool
    server.registerTool(
        'run-command',
        {
            description: 'Executes a shell command in a specific sandbox',
            inputSchema: {
                sandboxId: z.string().describe('The ID of the sandbox'),
                command: z.string().describe('The shell command to execute'),
                cwd: z.string().optional().describe('Working directory for the command'),
                timeout: z.number().optional().describe('Timeout in milliseconds'),
            },
        },
        async ({
            sandboxId,
            command,
            cwd,
            timeout,
        }: {
            sandboxId: string;
            command: string;
            cwd?: string;
            timeout?: number;
        }): Promise<CallToolResult> => {
            try {
                // Get sandbox from storage
                const sandbox = sandboxes.get(sandboxId);
                if (!sandbox) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Sandbox not found: ${sandboxId}`,
                            },
                        ],
                        isError: true,
                    };
                }

                if (!sandbox.containerUrl) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Sandbox ${sandboxId} does not have a containerUrl yet`,
                            },
                        ],
                        isError: true,
                    };
                }

                // Call sandbox /exec endpoint
                const response = await fetch(`${sandbox.containerUrl}/exec`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ command, cwd, timeout }),
                });

                const result = await response.json();

                if (!response.ok) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(result, null, 2),
                            },
                        ],
                        isError: true,
                    };
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                const err = error as Error;
                console.error('Error running command:', err);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error running command: ${err.message}`,
                        },
                    ],
                    isError: true,
                };
            }
        },
    );

    // Register write-file tool
    server.registerTool(
        'write-file',
        {
            description: 'Writes content to a file in a specific sandbox',
            inputSchema: {
                sandboxId: z.string().describe('The ID of the sandbox'),
                path: z.string().describe('File path to write to'),
                content: z.string().describe('Content to write to the file'),
                mode: z.number().optional().describe('File mode (permissions)'),
            },
        },
        async ({
            sandboxId,
            path,
            content,
            mode,
        }: {
            sandboxId: string;
            path: string;
            content: string;
            mode?: number;
        }): Promise<CallToolResult> => {
            try {
                // Get sandbox from storage
                const sandbox = sandboxes.get(sandboxId);
                if (!sandbox) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Sandbox not found: ${sandboxId}`,
                            },
                        ],
                        isError: true,
                    };
                }

                if (!sandbox.containerUrl) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Sandbox ${sandboxId} does not have a containerUrl yet`,
                            },
                        ],
                        isError: true,
                    };
                }

                // Call sandbox /write-file endpoint
                const response = await fetch(`${sandbox.containerUrl}/write-file`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ path, content, mode }),
                });

                const result = await response.json();

                if (!response.ok) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(result, null, 2),
                            },
                        ],
                        isError: true,
                    };
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                const err = error as Error;
                console.error('Error writing file:', err);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error writing file: ${err.message}`,
                        },
                    ],
                    isError: true,
                };
            }
        },
    );

    // Register read-file tool
    server.registerTool(
        'read-file',
        {
            description: 'Reads file contents from a specific sandbox',
            inputSchema: {
                sandboxId: z.string().describe('The ID of the sandbox'),
                path: z.string().describe('File path to read from'),
            },
        },
        async ({ sandboxId, path }: { sandboxId: string; path: string }): Promise<CallToolResult> => {
            try {
                // Get sandbox from storage
                const sandbox = sandboxes.get(sandboxId);
                if (!sandbox) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Sandbox not found: ${sandboxId}`,
                            },
                        ],
                        isError: true,
                    };
                }

                if (!sandbox.containerUrl) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Sandbox ${sandboxId} does not have a containerUrl yet`,
                            },
                        ],
                        isError: true,
                    };
                }

                // Call sandbox /read-file endpoint
                const response = await fetch(`${sandbox.containerUrl}/read-file`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ path }),
                });

                const result = await response.json();

                if (!response.ok) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(result, null, 2),
                            },
                        ],
                        isError: true,
                    };
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                const err = error as Error;
                console.error('Error reading file:', err);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error reading file: ${err.message}`,
                        },
                    ],
                    isError: true,
                };
            }
        },
    );

    // Register list-files tool
    server.registerTool(
        'list-files',
        {
            description: 'Lists files and directories in a sandbox path',
            inputSchema: {
                sandboxId: z.string().describe('The ID of the sandbox'),
                path: z.string().optional().describe('Directory path to list (defaults to current directory)'),
            },
        },
        async ({ sandboxId, path }: { sandboxId: string; path?: string }): Promise<CallToolResult> => {
            try {
                // Get sandbox from storage
                const sandbox = sandboxes.get(sandboxId);
                if (!sandbox) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Sandbox not found: ${sandboxId}`,
                            },
                        ],
                        isError: true,
                    };
                }

                if (!sandbox.containerUrl) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Sandbox ${sandboxId} does not have a containerUrl yet`,
                            },
                        ],
                        isError: true,
                    };
                }

                // Call sandbox /list-files endpoint
                const response = await fetch(`${sandbox.containerUrl}/list-files`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ path }),
                });

                const result = await response.json();

                if (!response.ok) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(result, null, 2),
                            },
                        ],
                        isError: true,
                    };
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error) {
                const err = error as Error;
                console.error('Error listing files:', err);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error listing files: ${err.message}`,
                        },
                    ],
                    isError: true,
                };
            }
        },
    );

    return server;
};
