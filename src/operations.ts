// Abstracted operations for sandbox functionality
import { exec } from 'node:child_process';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import { log } from 'apify';

import { SANDBOX_DIR, PYTHON_CODE_DIR, JS_TS_CODE_DIR } from './consts.js';
import { getExecutionEnvironment } from './environment.js';

const execAsync = promisify(exec);

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
            env: getExecutionEnvironment(),
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
        const resolveTargetPath = (): string => {
            if (!dirPath) {
                return SANDBOX_DIR;
            }
            return path.isAbsolute(dirPath) ? dirPath : path.join(SANDBOX_DIR, dirPath);
        };
        const targetPath = resolveTargetPath();

        const entries = await fs.readdir(targetPath, { withFileTypes: true });

        const files = entries.map((entry) => ({
            name: entry.name,
            type: entry.isDirectory() ? ('directory' as const) : ('file' as const),
            path: path.join(targetPath, entry.name),
        }));

        log.debug('listFiles succeeded', { path: targetPath, fileCount: files.length });
        return {
            path: targetPath,
            files,
        };
    } catch (error) {
        const err = error as Error;
        const resolveFallbackPath = (): string => {
            if (!dirPath) {
                return SANDBOX_DIR;
            }
            return path.isAbsolute(dirPath) ? dirPath : path.join(SANDBOX_DIR, dirPath);
        };
        const fallbackPath = resolveFallbackPath();
        log.debug('listFiles failed', { path: fallbackPath, error: err.message });
        return {
            path: fallbackPath,
            files: [],
            error: err.message,
        };
    }
};

/**
 * Execute code in a specified language (JS, TS, or Python)
 *
 * IMPORTANT: Each code execution spawns a new interpreter process to ensure isolation.
 * This prevents agents from using variables from previous code executions.
 * While this ensures security and isolation, it means each execution starts fresh
 * with no access to state from previous executions. Consider this limitation when
 * designing multi-step agent workflows that require shared state.
 */
export const executeCode = async (
    code: string,
    language: 'js' | 'ts' | 'py',
    timeout?: number,
): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    language: string;
}> => {
    log.debug('executeCode called', { language, codeLength: code.length, timeout });
    const tempFiles: string[] = [];

    try {
        // Validate language
        if (!['js', 'ts', 'py'].includes(language)) {
            return {
                stdout: '',
                stderr: `Unsupported language: ${language}. Supported languages: js, ts, py`,
                exitCode: 1,
                language,
            };
        }

        // Validate code is not empty
        if (!code || code.trim().length === 0) {
            return {
                stdout: '',
                stderr: 'Code cannot be empty',
                exitCode: 1,
                language,
            };
        }

        // Create hash of code for unique filename
        const codeHash = crypto.createHash('sha256').update(code).digest('hex').slice(0, 12);
        const fileExtensions: Record<string, string> = {
            js: '.js',
            ts: '.ts',
            py: '.py',
        };
        const tempFile = path.join('/tmp', `code-${codeHash}${fileExtensions[language]}`);

        // Write code to file
        await fs.writeFile(tempFile, code, 'utf8');
        tempFiles.push(tempFile);

        let command: string;
        let executionDir: string;

        // Build command based on language and set execution directory
        if (language === 'js') {
            command = `node ${tempFile}`;
            executionDir = JS_TS_CODE_DIR;
        } else if (language === 'ts') {
            command = `tsx ${tempFile}`;
            executionDir = JS_TS_CODE_DIR;
        } else if (language === 'py') {
            command = `python ${tempFile}`;
            executionDir = PYTHON_CODE_DIR;
        } else {
            return {
                stdout: '',
                stderr: `Unsupported language: ${language}`,
                exitCode: 1,
                language,
            };
        }

        const execOptions: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv } = {
            env: getExecutionEnvironment(),
            cwd: executionDir,
        };

        if (timeout) {
            execOptions.timeout = timeout;
        }

        const { stdout, stderr } = await execAsync(command, execOptions);

        log.debug('executeCode succeeded', { language, exitCode: 0 });
        return {
            stdout,
            stderr,
            exitCode: 0,
            language,
        };
    } catch (error) {
        const err = error as { message: string; stdout?: string; stderr?: string; code?: number };
        log.debug('executeCode failed', { language, error: err.message, exitCode: err.code || 1 });
        return {
            stdout: err.stdout || '',
            stderr: err.stderr || err.message || 'Code execution failed',
            exitCode: err.code || 1,
            language,
        };
    } finally {
        // Clean up temporary files
        for (const tempFile of tempFiles) {
            try {
                await fs.unlink(tempFile);
            } catch {
                log.debug('Failed to clean up temp file', { path: tempFile });
            }
        }
    }
};
