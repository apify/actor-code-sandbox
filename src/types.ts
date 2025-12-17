/**
 * Type definitions for the Sandbox Actor
 */

export interface ActorInput {
    /**
     * Node.js dependencies object for JavaScript and TypeScript code execution
     * Format: { "package-name": "version", ... }
     * Example: { "zod": "^3.0", "axios": "latest" }
     */
    nodeDependencies?: Record<string, string>;

    /**
     * Python requirements in requirements.txt format for Python code execution
     * Format: one package per line with optional version specifiers
     * Example: "requests==2.31.0\npandas>=2.0.0\nnumpy"
     */
    pythonRequirementsTxt?: string;

    /**
     * Optional bash script to customize the sandbox environment
     * Runs after dependency installation in /sandbox directory
     */
    initScript?: string;
}
