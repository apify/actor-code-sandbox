import { createServer } from 'node:http';

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Actor, log } from 'apify';
import type { Request, Response } from 'express';
import express from 'express';

import { executeInitScript, setupExecutionEnvironment } from './environment.js';
import { createMcpServer } from './mcp.js';
import {
    appendFile,
    createDirectory,
    createZipArchive,
    deleteFileOrDirectory,
    executeCode,
    listFiles,
    listFilesDetailed,
    readFile,
    readFileBinary,
    runCommand,
    statPath,
    writeFile,
    writeFileBinary,
} from './operations.js';
import { getShellHTML, initializeShellServer } from './shell.js';
import { getLandingPageHTML } from './templates/landing.js';
import type { ActorInput } from './types.js';

// Track initialization state
let initializationComplete = false;
let initializationError: string | null = null;

// Check if running in local mode
const isLocalMode = process.env.MODE === 'local';
if (isLocalMode) {
    log.info('🔧 Running in LOCAL MODE - Sandbox directories and environment setup will be skipped');
}

// The init() call configures the Actor for its environment. It's recommended to start every Actor with an init()
await Actor.init();

// Get the port from environment variables or Actor config
const port = parseInt(process.env.ACTOR_WEB_SERVER_PORT || '', 10) || Actor.config.get('standbyPort') || 3000;

// Get the server URL from environment variable or construct it
const serverUrl = process.env.ACTOR_WEB_SERVER_URL || `http://localhost:${port}`;

// Retrieve Actor input
const input = await Actor.getInput<ActorInput>();
log.info('Actor input retrieved', {
    mode: isLocalMode ? 'local' : 'production',
    hasNodeDependencies: !!input?.nodeDependencies && Object.keys(input.nodeDependencies).length > 0,
    hasPythonRequirements: !!input?.pythonRequirementsTxt?.trim().length,
    hasInitScript: !!input?.initScript?.trim().length,
});

// Setup execution environment with dependencies
log.info('Setting up execution environment...');
const setupResult = await setupExecutionEnvironment({
    nodeDependencies: input?.nodeDependencies,
    pythonRequirementsTxt: input?.pythonRequirementsTxt,
});

if (!setupResult.success) {
    log.warning('Some dependencies failed to install', {
        nodeInstalled: setupResult.nodeSetup.installed,
        nodeFailed: setupResult.nodeSetup.failed,
        pythonInstalled: setupResult.pythonSetup.installed,
        pythonFailed: setupResult.pythonSetup.failed,
    });
} else {
    log.info('All dependencies installed successfully');
}

// Execute init script if provided and not empty
if (input?.initScript && input.initScript.trim().length > 0) {
    log.info('Executing init script...');
    const initResult = await executeInitScript(input.initScript);
    if (initResult.exitCode !== 0) {
        log.error('Init script failed', {
            exitCode: initResult.exitCode,
            stderr: initResult.stderr,
            stdout: initResult.stdout,
        });
        initializationError = `Init script failed with exit code ${initResult.exitCode}`;
    }
} else {
    log.debug('No init script provided or init script is empty');
}

// Mark initialization as complete
initializationComplete = true;
log.info('Actor startup complete - ready for requests');

// Create Express app
const app = express();

// Create HTTP server for WebSocket support
const server = createServer(app);

// ============================================================================
// RESTful Filesystem Endpoints (/fs/*)
// IMPORTANT: These MUST come before app.use(express.json()) to handle raw bodies
// ============================================================================

// HEAD /fs and /fs/ - Root directory metadata (must come before wildcard route)
const handleHeadRoot = async (_req: Request, res: Response) => {
    try {
        const filePath = ''; // Empty string resolves to /sandbox
        log.info('REST HEAD /fs (root) request received', { path: filePath });

        const result = await statPath(filePath);

        if (!result.exists || result.error) {
            log.warning('REST HEAD /fs (root) failed', { path: filePath, error: result.error });
            res.status(404).end();
            return;
        }

        // Set metadata headers
        res.setHeader('X-File-Type', result.type);
        res.setHeader('X-Path', result.path);

        if (result.mtime) {
            res.setHeader('Last-Modified', result.mtime.toUTCString());
        }

        log.info('REST HEAD /fs (root) completed successfully', { path: result.path, type: result.type });
        res.status(200).end();
    } catch (error) {
        log.error('REST HEAD /fs (root) error', { error });
        res.status(500).end();
    }
};

app.head('/fs', handleHeadRoot);
app.head('/fs/', handleHeadRoot);

// GET /fs and /fs/ - List root directory (must come before wildcard route)
const handleGetRoot = async (req: Request, res: Response) => {
    try {
        const filePath = ''; // Empty string resolves to /sandbox
        const download = req.query.download === '1';

        log.info('REST GET /fs (root) request received', { path: filePath, download });

        // Check if path exists and get type
        const statResult = await statPath(filePath);

        if (!statResult.exists || statResult.error) {
            log.warning('REST GET /fs (root) failed', { path: filePath, error: statResult.error });
            res.status(404).json({ error: statResult.error || 'Path not found', path: filePath });
            return;
        }

        if (statResult.type === 'directory') {
            // Directory: either return JSON listing or ZIP download
            if (download) {
                // Download directory as ZIP
                const zipResult = await createZipArchive(filePath);

                if (zipResult.error || !zipResult.stream) {
                    log.warning('REST GET /fs (root) ZIP creation failed', { path: filePath, error: zipResult.error });
                    res.status(500).json({ error: zipResult.error || 'Failed to create ZIP archive' });
                    return;
                }

                // Extract directory name for filename
                res.setHeader('Content-Type', 'application/zip');
                res.setHeader('Content-Disposition', 'attachment; filename="sandbox.zip"');

                log.info('REST GET /fs (root) streaming ZIP', { path: zipResult.path });
                zipResult.stream.pipe(res);
            } else {
                // Return JSON directory listing
                const listResult = await listFilesDetailed(filePath);

                if (listResult.error) {
                    log.warning('REST GET /fs (root) directory listing failed', {
                        path: filePath,
                        error: listResult.error,
                    });
                    res.status(500).json({ error: listResult.error, path: filePath });
                    return;
                }

                log.info('REST GET /fs (root) directory listing completed', {
                    path: listResult.path,
                    entryCount: listResult.entries.length,
                });
                res.json(listResult);
            }
        }
    } catch (error) {
        log.error('REST GET /fs (root) error', { error });
        const err = error as Error;
        res.status(500).json({ error: err.message });
    }
};

app.get('/fs', handleGetRoot);
app.get('/fs/', handleGetRoot);

// HEAD /fs/* - Get file or directory metadata
app.head('/fs/*', async (req: Request, res: Response) => {
    try {
        const filePath = req.params[0] || '/';

        log.info('REST HEAD /fs/* request received', { path: filePath });

        const result = await statPath(filePath);

        if (!result.exists || result.error) {
            log.warning('REST HEAD /fs/* failed', { path: filePath, error: result.error });
            res.status(404).end();
            return;
        }

        // Set metadata headers
        res.setHeader('X-File-Type', result.type);
        res.setHeader('X-Path', result.path);

        if (result.mtime) {
            res.setHeader('Last-Modified', result.mtime.toUTCString());
        }

        if (result.type === 'file' && result.size !== undefined) {
            res.setHeader('Content-Length', result.size.toString());
            // Detect MIME type from file extension
            const mimeResult = await readFileBinary(filePath);
            if (mimeResult.mimeType) {
                res.setHeader('Content-Type', mimeResult.mimeType);
            }
        }

        log.info('REST HEAD /fs/* completed successfully', { path: result.path, type: result.type });
        res.status(200).end();
    } catch (error) {
        log.error('REST HEAD /fs/* error', { error });
        res.status(500).end();
    }
});

// GET /fs/* - Read file or list directory
app.get('/fs/*', async (req: Request, res: Response) => {
    try {
        const filePath = req.params[0] || '/';
        const download = req.query.download === '1';

        log.info('REST GET /fs/* request received', { path: filePath, download });

        // Check if path exists and get type
        const statResult = await statPath(filePath);

        if (!statResult.exists || statResult.error) {
            log.warning('REST GET /fs/* failed', { path: filePath, error: statResult.error });
            res.status(404).json({ error: statResult.error || 'Path not found', path: filePath });
            return;
        }

        if (statResult.type === 'directory') {
            // Directory: either return JSON listing or ZIP download
            if (download) {
                // Download directory as ZIP
                const zipResult = await createZipArchive(filePath);

                if (zipResult.error || !zipResult.stream) {
                    log.warning('REST GET /fs/* ZIP creation failed', { path: filePath, error: zipResult.error });
                    res.status(500).json({ error: zipResult.error || 'Failed to create ZIP archive' });
                    return;
                }

                // Extract directory name for filename
                const dirName = filePath.split('/').filter(Boolean).pop() || 'archive';
                res.setHeader('Content-Type', 'application/zip');
                res.setHeader('Content-Disposition', `attachment; filename="${dirName}.zip"`);

                log.info('REST GET /fs/* streaming ZIP', { path: zipResult.path });
                zipResult.stream.pipe(res);
            } else {
                // Return JSON directory listing
                const listResult = await listFilesDetailed(filePath);

                if (listResult.error) {
                    log.warning('REST GET /fs/* directory listing failed', { path: filePath, error: listResult.error });
                    res.status(500).json({ error: listResult.error, path: filePath });
                    return;
                }

                log.info('REST GET /fs/* directory listing completed', {
                    path: listResult.path,
                    entryCount: listResult.entries.length,
                });
                res.json(listResult);
            }
        } else {
            // File: return raw bytes with appropriate Content-Type
            const fileResult = await readFileBinary(filePath);

            if (fileResult.error || !fileResult.content) {
                log.warning('REST GET /fs/* file read failed', { path: filePath, error: fileResult.error });
                res.status(404).json({ error: fileResult.error || 'Failed to read file', path: filePath });
                return;
            }

            // Set Content-Type
            res.setHeader('Content-Type', fileResult.mimeType || 'application/octet-stream');

            // Set Content-Disposition for download
            if (download) {
                const fileName = filePath.split('/').filter(Boolean).pop() || 'file';
                res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            }

            log.info('REST GET /fs/* file read completed', {
                path: fileResult.path,
                size: fileResult.size,
                mimeType: fileResult.mimeType,
            });
            res.send(fileResult.content);
        }
    } catch (error) {
        log.error('REST GET /fs/* error', { error });
        const err = error as Error;
        res.status(500).json({ error: err.message });
    }
});

// PUT /fs/* - Write/replace file
app.put('/fs/*', express.raw({ type: '*/*', limit: '500mb' }), async (req: Request, res: Response) => {
    try {
        const filePath = req.params[0];
        const content = req.body;

        log.info('REST PUT /fs/* request received', {
            path: filePath,
            contentLength: content?.length,
            contentType: req.headers['content-type'],
        });

        if (!filePath || filePath === '/') {
            log.warning('REST PUT /fs/*: cannot write to root directory');
            res.status(400).json({ error: 'Cannot write to root directory' });
            return;
        }

        if (!content) {
            log.warning('REST PUT /fs/*: content is required');
            res.status(400).json({ error: 'Content is required' });
            return;
        }

        const result = await writeFileBinary(filePath, content);

        if (!result.success) {
            log.warning('REST PUT /fs/* failed', { path: filePath, error: result.error });
            res.status(500).json({ error: result.error, path: filePath });
            return;
        }

        log.info('REST PUT /fs/* completed successfully', { path: result.path, size: result.size });
        res.status(200).json({ success: true, path: result.path, size: result.size });
    } catch (error) {
        log.error('REST PUT /fs/* error', { error });
        const err = error as Error;
        res.status(500).json({ error: err.message });
    }
});

// POST /fs/* - Create directory or append to file
app.post('/fs/*', express.raw({ type: '*/*', limit: '500mb' }), async (req: Request, res: Response) => {
    try {
        const filePath = req.params[0];
        const mkdir = req.query.mkdir === '1';
        const append = req.query.append === '1';

        log.info('REST POST /fs/* request received', { path: filePath, mkdir, append });

        if (!filePath || filePath === '/') {
            log.warning('REST POST /fs/*: cannot operate on root directory');
            res.status(400).json({ error: 'Cannot operate on root directory' });
            return;
        }

        if (!mkdir && !append) {
            log.warning('REST POST /fs/*: either mkdir=1 or append=1 query parameter is required');
            res.status(400).json({ error: 'Either mkdir=1 or append=1 query parameter is required' });
            return;
        }

        if (mkdir && append) {
            log.warning('REST POST /fs/*: cannot use both mkdir and append');
            res.status(400).json({ error: 'Cannot use both mkdir=1 and append=1' });
            return;
        }

        if (mkdir) {
            // Create directory
            const result = await createDirectory(filePath);

            if (!result.success) {
                log.warning('REST POST /fs/* mkdir failed', { path: filePath, error: result.error });
                res.status(500).json({ error: result.error, path: filePath });
                return;
            }

            log.info('REST POST /fs/* mkdir completed successfully', { path: result.path });
            res.status(201).json({ success: true, path: result.path, type: 'directory' });
        } else {
            // Append to file
            const content = req.body;

            if (!content) {
                log.warning('REST POST /fs/* append: content is required');
                res.status(400).json({ error: 'Content is required for append operation' });
                return;
            }

            const result = await appendFile(filePath, content);

            if (!result.success) {
                log.warning('REST POST /fs/* append failed', { path: filePath, error: result.error });
                res.status(500).json({ error: result.error, path: filePath });
                return;
            }

            log.info('REST POST /fs/* append completed successfully', { path: result.path, size: result.size });
            res.status(200).json({ success: true, path: result.path, size: result.size });
        }
    } catch (error) {
        log.error('REST POST /fs/* error', { error });
        const err = error as Error;
        res.status(500).json({ error: err.message });
    }
});

// DELETE /fs/* - Delete file or directory
app.delete('/fs/*', async (req: Request, res: Response) => {
    try {
        const filePath = req.params[0];
        const recursive = req.query.recursive === '1';

        log.info('REST DELETE /fs/* request received', { path: filePath, recursive });

        if (!filePath || filePath === '/') {
            log.warning('REST DELETE /fs/*: cannot delete root directory');
            res.status(400).json({ error: 'Cannot delete root directory' });
            return;
        }

        const result = await deleteFileOrDirectory(filePath, recursive);

        if (!result.success) {
            // Check if error is due to non-empty directory
            if (result.error?.includes('not empty')) {
                log.warning('REST DELETE /fs/* failed - directory not empty', { path: filePath, error: result.error });
                res.status(409).json({ error: result.error, path: filePath, code: 'DIRECTORY_NOT_EMPTY' });
                return;
            }

            log.warning('REST DELETE /fs/* failed', { path: filePath, error: result.error });
            res.status(500).json({ error: result.error, path: filePath });
            return;
        }

        log.info('REST DELETE /fs/* completed successfully', { path: result.path });
        res.status(200).json({ success: true, path: result.path, deleted: true });
    } catch (error) {
        log.error('REST DELETE /fs/* error', { error });
        const err = error as Error;
        res.status(500).json({ error: err.message });
    }
});

// ============================================================================
// JSON-based REST Endpoints (require express.json middleware)
// ============================================================================

// Middleware for JSON parsing (applied to routes below)
app.use(express.json({ limit: '50mb' }));

// Serve xterm.js assets from node_modules for shell terminal
app.use('/xterm', express.static('./node_modules/@xterm/xterm/css'));
app.use('/xterm', express.static('./node_modules/@xterm/xterm/lib'));
app.use('/xterm-addon', express.static('./node_modules/@xterm/addon-fit/lib'));

// Landing page endpoint
app.get('/', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(
        getLandingPageHTML({
            serverUrl,
            isLocalMode,
        }),
    );
});

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
    if (!initializationComplete) {
        res.status(503).json({
            status: 'initializing',
            message: 'Actor is initializing dependencies and running init script',
        });
        return;
    }

    if (initializationError) {
        res.status(503).json({
            status: 'unhealthy',
            message: initializationError,
        });
        return;
    }

    res.json({ status: 'healthy' });
});

// Shell terminal endpoint
app.get('/shell', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(getShellHTML());
});

// MCP endpoint using proper StreamableHTTPServerTransport
app.post('/mcp', async (req: Request, res: Response) => {
    log.info('MCP request received', { body: req.body });
    const mcpServer = createMcpServer();
    try {
        const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, req.body);
        res.on('close', () => {
            log.info('MCP request closed');
            void transport.close();
            void mcpServer.close();
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

// Initialize shell WebSocket server
initializeShellServer(server);

// Start server
server.listen(port, () => {
    log.info(`AI Sandbox listening on port ${port}`);
    log.info(`Server URL: ${serverUrl}`);

    // Print startup information
    console.log('\n=====================================');
    console.log('🚀 AI Sandbox Started');
    console.log('=====================================\n');

    console.log('🏠 Landing page (open first):');
    console.log(`   GET ${serverUrl}/`);
    console.log('       Connection details, quick links, and endpoint URLs\n');

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

    // RESTful Filesystem Endpoints
    console.log('🗂️  RESTful Filesystem Endpoints:');
    console.log(`   GET ${serverUrl}/fs/{path}`);
    console.log(`       Read file or list directory (add ?download=1 to download)`);
    console.log(`       Example: GET /fs/app/output/log.txt\n`);

    console.log(`   PUT ${serverUrl}/fs/{path}`);
    console.log(`       Write/replace file with request body`);
    console.log(`       Example: PUT /fs/app/config.json\n`);

    console.log(`   POST ${serverUrl}/fs/{path}?mkdir=1`);
    console.log(`       Create directory`);
    console.log(`       Example: POST /fs/app/data?mkdir=1\n`);

    console.log(`   POST ${serverUrl}/fs/{path}?append=1`);
    console.log(`       Append to file with request body`);
    console.log(`       Example: POST /fs/app/log.txt?append=1\n`);

    console.log(`   DELETE ${serverUrl}/fs/{path}`);
    console.log(`       Delete file or directory (add ?recursive=1 for non-empty dirs)`);
    console.log(`       Example: DELETE /fs/app/temp?recursive=1\n`);

    console.log(`   HEAD ${serverUrl}/fs/{path}`);
    console.log(`       Get file/directory metadata in headers\n`);

    // Shell terminal endpoint
    console.log(`   GET ${serverUrl}/shell`);
    console.log(`       Interactive shell terminal\n`);

    console.log('=====================================\n');
});
