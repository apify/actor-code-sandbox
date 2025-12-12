// Abstracted operations for sandbox functionality
import { exec } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { log } from 'apify';

import { SANDBOX_DIR } from './consts.js';

const execAsync = promisify(exec);

/**
 * Get sanitized environment without APIFY_* variables
 */
export const getSanitizedEnv = (): NodeJS.ProcessEnv => {
    const env: NodeJS.ProcessEnv = {};
    Object.keys(process.env).forEach((key) => {
        if (!key.startsWith('APIFY_')) {
            env[key] = process.env[key];
        }
    });
    return env;
};

/**
 * Execute a shell command
 */
export const runCommand = async (
    command: string,
    cwd?: string,
    timeout?: number,
): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
}> => {
    log.debug('runCommand called', { command, cwd, timeout });
    try {
        const execOptions: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv } = {
            env: getSanitizedEnv(),
            // Use /sandbox as default working directory
            cwd: cwd || SANDBOX_DIR,
        };
        if (timeout) {
            execOptions.timeout = timeout;
        }

        const { stdout, stderr } = await execAsync(command, execOptions);

        log.debug('runCommand succeeded', { command, cwd: execOptions.cwd, exitCode: 0 });
        return {
            stdout,
            stderr,
            exitCode: 0,
        };
    } catch (error) {
        const err = error as { message: string; stdout?: string; stderr?: string; code?: number };
        log.debug('runCommand failed', { command, error: err.message, exitCode: err.code || 1 });
        return {
            stdout: err.stdout || '',
            stderr: err.stderr || '',
            exitCode: err.code || 1,
        };
    }
};

/**
 * Write content to a file
 */
export const writeFile = async (
    filePath: string,
    content: string,
    mode?: number,
): Promise<{
    success: boolean;
    path: string;
    error?: string;
}> => {
    log.debug('writeFile called', { path: filePath, contentLength: content.length, mode });
    try {
        // Resolve path relative to /sandbox if it's a relative path
        const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(SANDBOX_DIR, filePath);
        
        // Ensure directory exists
        const dir = path.dirname(resolvedPath);
        await fs.mkdir(dir, { recursive: true });

        // Write the file
        await fs.writeFile(resolvedPath, content, 'utf8');

        // Set file mode if specified
        if (mode) {
            await fs.chmod(resolvedPath, mode);
        }

        log.debug('writeFile succeeded', { path: resolvedPath });
        return {
            success: true,
            path: resolvedPath,
        };
    } catch (error) {
        const err = error as Error;
        log.debug('writeFile failed', { path: filePath, error: err.message });
        return {
            success: false,
            path: filePath,
            error: err.message,
        };
    }
};

/**
 * Read file contents
 */
export const readFile = async (
    filePath: string,
): Promise<{
    content?: string;
    path: string;
    error?: string;
}> => {
    log.debug('readFile called', { path: filePath });
    try {
        // Resolve path relative to /sandbox if it's a relative path
        const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(SANDBOX_DIR, filePath);
        
        const content = await fs.readFile(resolvedPath, 'utf8');

        log.debug('readFile succeeded', { path: resolvedPath, contentLength: content.length });
        return {
            content,
            path: resolvedPath,
        };
    } catch (error) {
        const err = error as Error;
        log.debug('readFile failed', { path: filePath, error: err.message });
        return {
            path: filePath,
            error: err.message,
        };
    }
};

/**
 * List files in directory
 */
export const listFiles = async (
    dirPath?: string,
): Promise<{
    path: string;
    files: {
        name: string;
        type: 'file' | 'directory';
        path: string;
    }[];
    error?: string;
}> => {
    log.debug('listFiles called', { path: dirPath });
    try {
        // Use /sandbox as default, or resolve relative paths relative to /sandbox
        const targetPath = dirPath 
            ? (path.isAbsolute(dirPath) ? dirPath : path.join(SANDBOX_DIR, dirPath))
            : SANDBOX_DIR;

        const entries = await fs.readdir(targetPath, { withFileTypes: true });

        const files = entries.map((entry) => ({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' as const : ('file' as const),
            path: path.join(targetPath, entry.name),
        }));

        log.debug('listFiles succeeded', { path: targetPath, fileCount: files.length });
        return {
            path: targetPath,
            files,
        };
    } catch (error) {
        const err = error as Error;
        const fallbackPath = dirPath 
            ? (path.isAbsolute(dirPath) ? dirPath : path.join(SANDBOX_DIR, dirPath))
            : SANDBOX_DIR;
        log.debug('listFiles failed', { path: fallbackPath, error: err.message });
        return {
            path: fallbackPath,
            files: [],
            error: err.message,
        };
    }
};
