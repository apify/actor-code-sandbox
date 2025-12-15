// Environment setup for code execution (Node.js and Python)
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';

import { log } from 'apify';

import { SANDBOX_DIR, PYTHON_CODE_DIR, JS_TS_CODE_DIR, INIT_SCRIPT_TIMEOUT } from './consts.js';

const execAsync = promisify(exec);

/**
 * Directories for code execution environments
 */
export const EXECUTION_DIRS = {
    NODE_MODULES: path.join(SANDBOX_DIR, 'node_modules'),
    PYTHON_VENV: path.join(SANDBOX_DIR, 'venv'),
    PYTHON_BIN: path.join(SANDBOX_DIR, 'venv', 'bin'),
} as const;

/**
 * Initialize code execution directories
 * Creates /sandbox/py and /sandbox/js-ts directories with 755 permissions
 */
export const initializeCodeDirectories = async (): Promise<void> => {
    log.debug('Initializing code execution directories');
    try {
        // Create Python code directory
        await fs.mkdir(PYTHON_CODE_DIR, { recursive: true, mode: 0o755 });
        log.debug('Python code directory created', { path: PYTHON_CODE_DIR });

        // Create JS/TS code directory
        await fs.mkdir(JS_TS_CODE_DIR, { recursive: true, mode: 0o755 });
        log.debug('JavaScript/TypeScript code directory created', { path: JS_TS_CODE_DIR });

        log.debug('Code execution directories initialized successfully');
    } catch (error) {
        const err = error as Error;
        log.error('Failed to initialize code directories', { error: err.message });
        throw error;
    }
};

/**
 * Initialize Node.js execution environment
 * Creates code directories first, then node_modules directory
 */
export const initializeNodeEnvironment = async (): Promise<void> => {
    log.debug('Initializing Node.js environment');
    try {
        // Initialize code directories first
        await initializeCodeDirectories();

        // Create node_modules directory
        await fs.mkdir(EXECUTION_DIRS.NODE_MODULES, { recursive: true, mode: 0o755 });
        log.debug('Node modules directory created', { path: EXECUTION_DIRS.NODE_MODULES });

        log.info('Node.js environment initialized successfully');
    } catch (error) {
        const err = error as Error;
        log.error('Failed to initialize Node.js environment', { error: err.message });
        throw error;
    }
};

/**
 * Initialize Python virtual environment
 * Creates code directories first, then creates a Python venv in the sandbox directory
 */
export const initializePythonEnvironment = async (): Promise<void> => {
    log.debug('Initializing Python virtual environment');
    try {
        // Initialize code directories first
        await initializeCodeDirectories();

        // Check if venv already exists
        try {
            await fs.stat(EXECUTION_DIRS.PYTHON_VENV);
            log.debug('Python venv already exists', { path: EXECUTION_DIRS.PYTHON_VENV });
            return;
        } catch {
            // venv doesn't exist, create it
        }

        // Create Python venv with clean environment to avoid conflicts
        log.debug('Creating Python venv', { path: EXECUTION_DIRS.PYTHON_VENV });

        // Create a clean environment without PYTHONHOME/VIRTUAL_ENV to prevent conflicts
        const cleanEnv: NodeJS.ProcessEnv = {};
        Object.keys(process.env).forEach((key) => {
            if (!key.startsWith('APIFY_') && key !== 'PYTHONHOME' && key !== 'VIRTUAL_ENV') {
                cleanEnv[key] = process.env[key];
            }
        });
        // Explicitly set these to empty to override any inherited values
        cleanEnv.PYTHONHOME = '';
        cleanEnv.VIRTUAL_ENV = '';

        await execAsync(`python3 -m venv ${EXECUTION_DIRS.PYTHON_VENV}`, {
            env: cleanEnv,
        });

        log.info('Python virtual environment initialized successfully', {
            path: EXECUTION_DIRS.PYTHON_VENV,
        });
    } catch (error) {
        const err = error as Error;
        log.error('Failed to initialize Python environment', { error: err.message });
        throw error;
    }
};

/**
 * Install Node.js libraries via npm
 */
export const installNodeLibraries = async (
    libraries: string[],
): Promise<{
    success: boolean;
    installed: string[];
    failed: { library: string; error: string }[];
}> => {
    if (!libraries || libraries.length === 0) {
        log.debug('No Node.js libraries to install');
        return { success: true, installed: [], failed: [] };
    }

    log.info('Installing Node.js libraries', { count: libraries.length, libraries });

    const installed: string[] = [];
    const failed: { library: string; error: string }[] = [];

    // Ensure node_modules exists
    await initializeNodeEnvironment();

    for (const library of libraries) {
        try {
            log.debug('Installing Node.js library', { library });
            // Set NODE_PATH to ensure packages are installed in /sandbox/node_modules
            await execAsync(`NODE_PATH=/sandbox/node_modules npm install --save ${library}`, {
                cwd: SANDBOX_DIR,
                timeout: 120000, // 2 minutes per library
                env: {
                    ...process.env,
                    NODE_PATH: '/sandbox/node_modules',
                },
            });

            installed.push(library);
            log.debug('Node.js library installed successfully', { library });
        } catch (error) {
            const err = error as Error;
            log.warning('Failed to install Node.js library', { library, error: err.message });
            failed.push({ library, error: err.message });
        }
    }

    const success = failed.length === 0;
    log.info('Node.js libraries installation completed', { installed: installed.length, failed: failed.length });

    return { success, installed, failed };
};

/**
 * Install Python libraries via pip
 */
export const installPythonLibraries = async (
    libraries: string[],
): Promise<{
    success: boolean;
    installed: string[];
    failed: { library: string; error: string }[];
}> => {
    if (!libraries || libraries.length === 0) {
        log.debug('No Python libraries to install');
        return { success: true, installed: [], failed: [] };
    }

    log.info('Installing Python libraries', { count: libraries.length, libraries });

    const installed: string[] = [];
    const failed: { library: string; error: string }[] = [];

    // Ensure Python venv exists
    await initializePythonEnvironment();

    const pipBinary = path.join(EXECUTION_DIRS.PYTHON_BIN, 'pip');

    for (const library of libraries) {
        try {
            log.debug('Installing Python library', { library });
            await execAsync(`${pipBinary} install ${library}`, {
                timeout: 120000, // 2 minutes per library
            });

            installed.push(library);
            log.debug('Python library installed successfully', { library });
        } catch (error) {
            const err = error as Error;
            log.warning('Failed to install Python library', { library, error: err.message });
            failed.push({ library, error: err.message });
        }
    }

    const success = failed.length === 0;
    log.info('Python libraries installation completed', { installed: installed.length, failed: failed.length });

    return { success, installed, failed };
};

/**
 * Setup complete execution environment
 * Initializes both Node.js and Python environments and installs specified libraries
 */
export const setupExecutionEnvironment = async (input: {
    nodeLibraries?: string[];
    pythonLibraries?: string[];
}): Promise<{
    success: boolean;
    nodeSetup: { success: boolean; installed: string[]; failed: { library: string; error: string }[] };
    pythonSetup: { success: boolean; installed: string[]; failed: { library: string; error: string }[] };
    errors: string[];
}> => {
    log.info('Setting up complete execution environment');

    const errors: string[] = [];

    try {
        // Initialize both environments
        await Promise.all([initializeNodeEnvironment(), initializePythonEnvironment()]);
    } catch (error) {
        const err = error as Error;
        errors.push(`Environment initialization failed: ${err.message}`);
        log.error('Environment initialization failed', { error: err.message });
    }

    // Install libraries
    const [nodeSetup, pythonSetup] = await Promise.all([
        installNodeLibraries(input.nodeLibraries || []),
        installPythonLibraries(input.pythonLibraries || []),
    ]);

    const success = errors.length === 0 && nodeSetup.success && pythonSetup.success;

    log.info('Execution environment setup completed', {
        success,
        nodeLibrariesInstalled: nodeSetup.installed.length,
        nodeLibrariesFailed: nodeSetup.failed.length,
        pythonLibrariesInstalled: pythonSetup.installed.length,
        pythonLibrariesFailed: pythonSetup.failed.length,
    });

    return {
        success,
        nodeSetup,
        pythonSetup,
        errors,
    };
};

/**
 * Execute initialization bash script
 * Runs custom bash script in /sandbox directory to setup environment
 */
export const executeInitScript = async (
    script: string,
): Promise<{
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number;
}> => {
    log.debug('Executing init script', { scriptLength: script.length });

    const tempFiles: string[] = [];

    try {
        // Validate script is not empty
        if (!script || script.trim().length === 0) {
            log.warning('Init script is empty');
            return {
                success: true,
                stdout: '',
                stderr: '',
                exitCode: 0,
            };
        }

        // Create temp file for script
        const crypto = await import('node:crypto');
        const scriptHash = crypto.createHash('sha256').update(script).digest('hex').slice(0, 12);
        const tempFile = path.join('/tmp', `init-script-${scriptHash}.sh`);

        // Write script to temp file
        await fs.writeFile(tempFile, script, 'utf8');
        await fs.chmod(tempFile, 0o755);
        tempFiles.push(tempFile);

        log.debug('Init script written to temp file', { path: tempFile });

        // Execute script
        const execOptions: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv } = {
            cwd: SANDBOX_DIR,
            timeout: INIT_SCRIPT_TIMEOUT,
            env: getExecutionEnvironment(),
        };

        const { stdout, stderr } = await execAsync(`bash ${tempFile}`, execOptions);

        log.info('Init script executed successfully', { stdout: stdout.length, stderr: stderr.length });

        return {
            success: true,
            stdout,
            stderr,
            exitCode: 0,
        };
    } catch (error) {
        const err = error as { message: string; stdout?: string; stderr?: string; code?: number };
        log.error('Init script execution failed', {
            error: err.message,
            exitCode: err.code || 1,
            stderr: err.stderr,
        });

        return {
            success: false,
            stdout: err.stdout || '',
            stderr: err.stderr || err.message || 'Init script execution failed',
            exitCode: err.code || 1,
        };
    } finally {
        // Clean up temporary files
        for (const tempFile of tempFiles) {
            try {
                await fs.unlink(tempFile);
                log.debug('Cleaned up temp init script', { path: tempFile });
            } catch {
                log.debug('Failed to clean up temp init script', { path: tempFile });
            }
        }
    }
};

/**
 * Get environment variables for code execution
 * Returns environment with paths to Python venv and Node modules
 */
export const getExecutionEnvironment = (): NodeJS.ProcessEnv => {
    const env: NodeJS.ProcessEnv = {};

    // Copy non-APIFY variables
    Object.keys(process.env).forEach((key) => {
        if (!key.startsWith('APIFY_')) {
            env[key] = process.env[key];
        }
    });

    // Add Python venv to PATH
    const currentPath = env.PATH || '';
    env.PATH = `${EXECUTION_DIRS.PYTHON_BIN}:${currentPath}`;

    // Add Node modules to PATH
    env.PATH = `${path.join(SANDBOX_DIR, 'node_modules', '.bin')}:${env.PATH}`;

    // Set Node.js to find modules in /sandbox/node_modules
    env.NODE_PATH = path.join(SANDBOX_DIR, 'node_modules');

    // Set Python to use the venv
    env.VIRTUAL_ENV = EXECUTION_DIRS.PYTHON_VENV;
    env.PYTHONHOME = '';

    return env;
};
