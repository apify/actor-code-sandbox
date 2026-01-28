/**
 * Type definitions for the Apify AI Sandbox Actor
 */

export interface ActorInput {
    /**
     * Skill packages to install for the AI coding agent
     * Skills are SKILL.md files that provide specialized instructions
     * Format: array of skill package names or URLs
     * Example: ["apify/agent-skills"]
     */
    skills?: string[];

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
    initShellScript?: string;

    /**
     * Graceful shutdown timeout in seconds if no activity is detected.
     * Activity includes HTTP requests and shell interaction.
     * @default 600 (10 minutes)
     */
    idleTimeoutSeconds?: number;
}
