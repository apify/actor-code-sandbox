import { exec } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { Actor } from 'apify';
import type { Request, Response } from 'express';
import express from 'express';

const execAsync = promisify(exec);

// The init() call configures the Actor for its environment. It's recommended to start every Actor with an init()
await Actor.init();

// After Actor.init(), remove all APIFY_* environment variables to prevent access to sensitive data
// This ensures the sandbox cannot access Apify credentials or internal configuration
const apifyEnvVars: string[] = [];
Object.keys(process.env).forEach((key) => {
    if (key.startsWith('APIFY_')) {
        apifyEnvVars.push(key);
        delete process.env[key];
    }
});
console.log(`Removed ${apifyEnvVars.length} APIFY_* environment variables for security`);

// Create a sanitized environment object for child processes
const getSanitizedEnv = (): NodeJS.ProcessEnv => {
    const env: NodeJS.ProcessEnv = {};
    Object.keys(process.env).forEach((key) => {
        if (!key.startsWith('APIFY_')) {
            env[key] = process.env[key];
        }
    });
    return env;
};

// Create Express app
const app = express();

// Middleware
app.use(express.json({ limit: '50mb' }));

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'healthy' });
});

// Apify standby readiness probe
app.get('/readiness', (_req: Request, res: Response) => {
    res.writeHead(200);
    res.end('ok');
});

// Execute shell command
app.post('/exec', async (req: Request, res: Response) => {
    try {
        const { command, cwd, timeout } = req.body;

        if (!command) {
            res.status(400).json({
                error: 'Command is required',
            });
            return;
        }

        const execOptions: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv } = {
            env: getSanitizedEnv(), // Use sanitized environment without APIFY_* vars
        };
        if (cwd) {
            execOptions.cwd = cwd;
        }
        if (timeout) {
            execOptions.timeout = timeout;
        }

        const { stdout, stderr } = await execAsync(command, execOptions);

        res.json({
            stdout,
            stderr,
            exitCode: 0,
        });
    } catch (error) {
        console.error('Error executing command:', error);
        const err = error as { message: string; stdout?: string; stderr?: string; code?: number };
        res.status(500).json({
            error: err.message,
            stdout: err.stdout || '',
            stderr: err.stderr || '',
            exitCode: err.code || 1,
        });
    }
});

// Write file
app.post('/write-file', async (req: Request, res: Response) => {
    try {
        const { path: filePath, content, mode } = req.body;

        if (!filePath) {
            res.status(400).json({
                error: 'File path is required',
            });
            return;
        }

        if (content === undefined) {
            res.status(400).json({
                error: 'Content is required',
            });
            return;
        }

        // Ensure directory exists
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });

        // Write the file
        await fs.writeFile(filePath, content, 'utf8');

        // Set file mode if specified
        if (mode) {
            await fs.chmod(filePath, mode);
        }

        res.json({
            success: true,
            path: filePath,
        });
    } catch (error) {
        console.error('Error writing file:', error);
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

        if (!filePath) {
            res.status(400).json({
                error: 'File path is required',
            });
            return;
        }

        const content = await fs.readFile(filePath, 'utf8');

        res.json({
            content,
            path: filePath,
        });
    } catch (error) {
        console.error('Error reading file:', error);
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

        const targetPath = dirPath || process.cwd();

        const entries = await fs.readdir(targetPath, { withFileTypes: true });

        const files = entries.map((entry) => ({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            path: path.join(targetPath, entry.name),
        }));

        res.json({
            path: targetPath,
            files,
        });
    } catch (error) {
        console.error('Error listing files:', error);
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
    console.log(`Sandbox Actor listening on port ${port}`);
    console.log(`Server URL: ${serverUrl}`);
});
