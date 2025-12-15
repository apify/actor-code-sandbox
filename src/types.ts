/**
 * Type definitions for the Sandbox Actor
 */

export interface ActorInput {
    /**
     * Node.js/npm libraries to install for JavaScript and TypeScript code execution
     */
    nodeLibraries?: string[];

    /**
     * Python/pip libraries to install for Python code execution
     */
    pythonLibraries?: string[];

    /**
     * Optional bash script to customize the sandbox environment
     * Runs after library installation in /sandbox directory
     */
    initScript?: string;
}
