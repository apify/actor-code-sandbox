/**
 * Application Constants
 */

/**
 * Default sandbox working directory
 */
export const SANDBOX_DIR = '/sandbox';

/**
 * Python code execution directory
 */
export const PYTHON_CODE_DIR = '/sandbox/py';

/**
 * JavaScript/TypeScript code execution directory
 */
export const JS_TS_CODE_DIR = '/sandbox/js-ts';

/**
 * Node.js modules directory (inside js-ts for language isolation)
 */
export const NODE_MODULES_DIR = '/sandbox/js-ts/node_modules';

/**
 * Python virtual environment directory (inside py for language isolation)
 */
export const PYTHON_VENV_DIR = '/sandbox/py/venv';

/**
 * Python binary directory (inside venv)
 */
export const PYTHON_BIN_DIR = '/sandbox/py/venv/bin';

/**
 * Init script execution timeout (5 minutes)
 */
export const INIT_SCRIPT_TIMEOUT = 300000;
