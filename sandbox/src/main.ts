import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Actor , log } from 'apify';
import type { Request, Response } from 'express';
import express from 'express';

import { createMcpServer } from './mcp.js';
import { executeCode, listFiles, readFile, runCommand, writeFile } from './operations.js';

// The init() call configures the Actor for its environment. It's recommended to start every Actor with an init()
await Actor.init();

// Create Express app
const app = express();

// Middleware
app.use(express.json({ limit: '50mb' }));

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'healthy' });
});

// MCP endpoint using proper StreamableHTTPServerTransport
app.post('/mcp', async (req: Request, res: Response) => {
    log.info('MCP request received', { body: req.body });
    const server = createMcpServer();
    try {
        const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        res.on('close', () => {
            log.info('MCP request closed');
            void transport.close();
            void server.close();
        });
    } catch (error) {
        log.error('MCP request error', { error });
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

// Execute shell command
app.post('/exec', async (req: Request, res: Response) => {
    try {
        const { command, cwd, timeout } = req.body;

        log.info('REST /exec request received', { command, cwd, timeout });

        if (!command) {
            log.debug('REST /exec: command is required');
            res.status(400).json({
                error: 'Command is required',
            });
            return;
        }

        const result = await runCommand(command, cwd, timeout);

        if (result.exitCode !== 0) {
            log.debug('REST /exec completed with error', { command, exitCode: result.exitCode });
            res.status(500).json(result);
            return;
        }

        log.info('REST /exec completed successfully', { command });
        res.json(result);
    } catch (error) {
        log.error('REST /exec error', { error });
        const err = error as Error;
        res.status(500).json({
            error: err.message,
            stdout: '',
            stderr: '',
            exitCode: 1,
        });
    }
});

// Execute code (JavaScript, TypeScript, or Python)
app.post('/execute-code', async (req: Request, res: Response) => {
    try {
        const { code, language, timeout } = req.body;

        log.info('REST /execute-code request received', { language, codeLength: code?.length, timeout });

        if (!code) {
            log.debug('REST /execute-code: code is required');
            res.status(400).json({
                error: 'Code is required',
            });
            return;
        }

        if (!language) {
            log.debug('REST /execute-code: language is required');
            res.status(400).json({
                error: 'Language is required',
            });
            return;
        }

        const result = await executeCode(code, language, timeout);

        if (result.exitCode !== 0) {
            log.debug('REST /execute-code completed with error', { language, exitCode: result.exitCode });
            res.status(500).json(result);
            return;
        }

        log.info('REST /execute-code completed successfully', { language });
        res.json(result);
    } catch (error) {
        log.error('REST /execute-code error', { error });
        const err = error as Error;
        res.status(500).json({
            error: err.message,
            stdout: '',
            stderr: '',
            exitCode: 1,
            language: '',
        });
    }
});

// Write file
app.post('/write-file', async (req: Request, res: Response) => {
    try {
        const { path: filePath, content, mode } = req.body;

        log.info('REST /write-file request received', { path: filePath, contentLength: content?.length, mode });

        if (!filePath) {
            log.warning('REST /write-file: file path is required');
            res.status(400).json({
                error: 'File path is required',
            });
            return;
        }

        if (content === undefined) {
            log.warning('REST /write-file: content is required');
            res.status(400).json({
                error: 'Content is required',
            });
            return;
        }

        const result = await writeFile(filePath, content, mode);

        if (!result.success) {
            log.warning('REST /write-file failed', { path: filePath, error: result.error });
            res.status(500).json(result);
            return;
        }

        log.info('REST /write-file completed successfully', { path: filePath });
        res.json(result);
    } catch (error) {
        log.error('REST /write-file error', { error });
        const err = error as Error;
        res.status(500).json({
            error: err.message,
        });
    }
});

// Read file
app.post('/read-file', async (req: Request, res: Response) => {
    try {
        const { path: filePath } = req.body;

        log.info('REST /read-file request received', { path: filePath });

        if (!filePath) {
            log.warning('REST /read-file: file path is required');
            res.status(400).json({
                error: 'File path is required',
            });
            return;
        }

        const result = await readFile(filePath);

        if (result.error) {
            log.warning('REST /read-file failed', { path: filePath, error: result.error });
            res.status(404).json(result);
            return;
        }

        log.info('REST /read-file completed successfully', { path: filePath, contentLength: result.content?.length });
        res.json(result);
    } catch (error) {
        log.error('REST /read-file error', { error });
        const err = error as Error;
        res.status(404).json({
            error: err.message,
        });
    }
});

// List files in directory
app.post('/list-files', async (req: Request, res: Response) => {
    try {
        const { path: dirPath } = req.body;

        log.info('REST /list-files request received', { path: dirPath });

        const result = await listFiles(dirPath);

        if (result.error) {
            log.warning('REST /list-files failed', { path: dirPath, error: result.error });
            res.status(500).json(result);
            return;
        }

        log.info('REST /list-files completed successfully', { path: result.path, fileCount: result.files.length });
        res.json(result);
    } catch (error) {
        log.error('REST /list-files error', { error });
        const err = error as Error;
        res.status(500).json({
            error: err.message,
        });
    }
});

// Get the port from environment variables or Actor config
const port = parseInt(process.env.ACTOR_WEB_SERVER_PORT || '', 10) || Actor.config.get('standbyPort') || 3000;

// Get the server URL from environment variable or construct it
const serverUrl = process.env.ACTOR_WEB_SERVER_URL || `http://localhost:${port}`;

// Start server
app.listen(port, () => {
    log.info(`Sandbox Actor listening on port ${port}`);
    log.info(`Server URL: ${serverUrl}`);
    
    // Print startup information
    console.log('\n=====================================');
    console.log('🚀 Sandbox Actor Started');
    console.log('=====================================\n');
    
    // MCP Server URL
    console.log('📡 MCP Server Endpoint:');
    console.log(`        ${serverUrl}/mcp\n`);
    
    // REST API Endpoints
    console.log('🔧 Available REST Endpoints:');
    console.log(`   POST ${serverUrl}/exec`);
    console.log(`       Execute shell commands`);
    console.log(`       Body: { command: string, cwd?: string, timeout?: number }\n`);
    
    console.log(`   POST ${serverUrl}/execute-code`);
    console.log(`       Execute code (JavaScript, TypeScript, or Python)`);
    console.log(`       Body: { code: string, language: 'js' | 'ts' | 'py', timeout?: number }\n`);
    
    console.log(`   POST ${serverUrl}/read-file`);
    console.log(`       Read file contents`);
    console.log(`       Body: { path: string }\n`);
    
    console.log(`   POST ${serverUrl}/write-file`);
    console.log(`       Write file contents`);
    console.log(`       Body: { path: string, content: string, mode?: number }\n`);
    
    console.log(`   POST ${serverUrl}/list-files`);
    console.log(`       List directory contents`);
    console.log(`       Body: { path?: string }\n`);
    
    console.log(`   GET ${serverUrl}/health`);
    console.log(`       Health check\n`);
    
    console.log('=====================================\n');
});
