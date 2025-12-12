// MCP Server implementation for sandbox tools (run commands, read/write files)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { log } from 'apify';
import * as z from 'zod';

import { executeCode, listFiles, readFile, runCommand, writeFile } from './operations.js';

/**
 * Creates and configures the MCP server with all sandbox tools
 */
export const createMcpServer = () => {
    const server = new McpServer(
        {
            name: 'sandbox',
            version: '1.0.0',
        },
        {
            capabilities: {
                tools: {},
            },
        },
    );

    // Register run-command tool
    server.registerTool(
        'run-command',
        {
            description: 'Executes a shell command in the sandbox',
            inputSchema: {
                command: z.string().describe('The shell command to execute'),
                cwd: z.string().optional().describe('Working directory for the command'),
                timeout: z.number().optional().describe('Timeout in milliseconds'),
            },
        },
        async ({
            command,
            cwd,
            timeout,
        }: {
            command: string;
            cwd?: string;
            timeout?: number;
        }): Promise<CallToolResult> => {
            try {
                log.info('MCP run-command tool called', { command, cwd, timeout });
                const result = await runCommand(command, cwd, timeout);

                log.info('MCP run-command tool completed', { command, exitCode: result.exitCode });
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
                log.error('MCP run-command tool error', { command, error: err.message });
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
            description: 'Writes content to a file in the sandbox',
            inputSchema: {
                path: z.string().describe('File path to write to'),
                content: z.string().describe('Content to write to the file'),
                mode: z.number().optional().describe('File mode (permissions)'),
            },
        },
        async ({
            path,
            content,
            mode,
        }: {
            path: string;
            content: string;
            mode?: number;
        }): Promise<CallToolResult> => {
            try {
                log.info('MCP write-file tool called', { path, contentLength: content.length, mode });
                const result = await writeFile(path, content, mode);

                if (!result.success) {
                    log.warning('MCP write-file tool failed', { path, error: result.error });
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

                log.info('MCP write-file tool completed successfully', { path });
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
                log.error('MCP write-file tool error', { path, error: err.message });
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
            description: 'Reads file contents from the sandbox. To read only a part of a file (e.g., specific lines), use the run-command tool with utilities like sed, head, tail, or grep (e.g., "sed -n 10,20p file.txt" to read lines 10-20).',
            inputSchema: {
                path: z.string().describe('File path to read from'),
            },
        },
        async ({ path }: { path: string }): Promise<CallToolResult> => {
            try {
                log.info('MCP read-file tool called', { path });
                const result = await readFile(path);

                if (result.error) {
                    log.warning('MCP read-file tool failed', { path, error: result.error });
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

                log.info('MCP read-file tool completed successfully', { path, contentLength: result.content?.length });
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
                log.error('MCP read-file tool error', { path, error: err.message });
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
                path: z.string().optional().describe('Directory path to list (defaults to current directory)'),
            },
        },
        async ({ path }: { path?: string }): Promise<CallToolResult> => {
            try {
                log.info('MCP list-files tool called', { path });
                const result = await listFiles(path);

                if (result.error) {
                    log.warning('MCP list-files tool failed', { path, error: result.error });
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

                log.info('MCP list-files tool completed successfully', { path: result.path, fileCount: result.files.length });
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
                log.error('MCP list-files tool error', { path, error: err.message });
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

    // Register execute-code tool
    server.registerTool(
        'execute-code',
        {
            description: 'Executes code in JavaScript, TypeScript, or Python. Each execution is isolated in a new process (no state sharing between executions).',
            inputSchema: {
                code: z.string().describe('The code to execute'),
                language: z.enum(['js', 'ts', 'py']).describe('Programming language (js, ts, or py)'),
                timeout: z.number().optional().describe('Timeout in milliseconds'),
            },
        },
        async ({
            code,
            language,
            timeout,
        }: {
            code: string;
            language: 'js' | 'ts' | 'py';
            timeout?: number;
        }): Promise<CallToolResult> => {
            try {
                log.info('MCP execute-code tool called', { language, codeLength: code.length, timeout });
                const result = await executeCode(code, language, timeout);

                if (result.exitCode !== 0) {
                    log.warning('MCP execute-code tool failed', { language, exitCode: result.exitCode });
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

                log.info('MCP execute-code tool completed successfully', { language });
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
                log.error('MCP execute-code tool error', { language, error: err.message });
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error executing code: ${err.message}`,
                        },
                    ],
                    isError: true,
                };
            }
        },
    );

    return server;
};
