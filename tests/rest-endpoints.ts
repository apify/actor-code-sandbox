/**
 * REST Endpoints E2E Test Script
 *
 * Usage:
 *   npx tsx tests/rest-endpoints.ts http://localhost:3000
 *   npx tsx tests/rest-endpoints.ts https://your-actor-url.runs.apify.net/
 */

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
};

interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
}

const results: TestResult[] = [];

async function testEndpoint(
    baseUrl: string,
    method: string,
    endpoint: string,
    body: unknown,
    expectedStatus: number,
    testName: string,
): Promise<void> {
    try {
        const url = `${baseUrl}${endpoint}`;
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        if (response.status === expectedStatus) {
            console.log(`${colors.green}✓${colors.reset} ${testName}`);
            results.push({ name: testName, passed: true });
        } else {
            const errorMsg = `Expected status ${expectedStatus}, got ${response.status}`;
            console.log(`${colors.red}✗${colors.reset} ${testName}: ${errorMsg}`);
            results.push({ name: testName, passed: false, error: errorMsg });
        }
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`${colors.red}✗${colors.reset} ${testName}: ${errorMsg}`);
        results.push({ name: testName, passed: false, error: errorMsg });
    }
}

async function testEndpointWithOutputValidation(
    baseUrl: string,
    method: string,
    endpoint: string,
    body: unknown,
    expectedStatus: number,
    expectedOutputContent: string,
    testName: string,
): Promise<void> {
    try {
        const url = `${baseUrl}${endpoint}`;
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        const data = (await response.json()) as { stdout?: string; stderr?: string };

        if (response.status !== expectedStatus) {
            const errorMsg = `Expected status ${expectedStatus}, got ${response.status}`;
            console.log(`${colors.red}✗${colors.reset} ${testName}: ${errorMsg}`);
            results.push({ name: testName, passed: false, error: errorMsg });
            return;
        }

        const output = data.stdout || '';
        if (output.includes(expectedOutputContent)) {
            console.log(`${colors.green}✓${colors.reset} ${testName}`);
            results.push({ name: testName, passed: true });
        } else {
            const errorMsg = `Expected output to contain "${expectedOutputContent}", got: "${output}"`;
            console.log(`${colors.red}✗${colors.reset} ${testName}: ${errorMsg}`);
            results.push({ name: testName, passed: false, error: errorMsg });
        }
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`${colors.red}✗${colors.reset} ${testName}: ${errorMsg}`);
        results.push({ name: testName, passed: false, error: errorMsg });
    }
}

async function testFsEndpoint(
    baseUrl: string,
    method: string,
    endpoint: string,
    body: string | Uint8Array | null,
    expectedStatus: number,
    testName: string,
): Promise<void> {
    try {
        const url = `${baseUrl}${endpoint}`;
        const headers: HeadersInit = {};

        // Set Content-Type for binary data
        if (body instanceof Uint8Array) {
            headers['Content-Type'] = 'application/octet-stream';
        }

        const response = await fetch(url, {
            method,
            headers,
            body: (body as BodyInit) ?? undefined,
        });

        if (response.status === expectedStatus) {
            console.log(`${colors.green}✓${colors.reset} ${testName}`);
            results.push({ name: testName, passed: true });
        } else {
            const errorMsg = `Expected status ${expectedStatus}, got ${response.status}`;
            console.log(`${colors.red}✗${colors.reset} ${testName}: ${errorMsg}`);
            results.push({ name: testName, passed: false, error: errorMsg });
        }
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`${colors.red}✗${colors.reset} ${testName}: ${errorMsg}`);
        results.push({ name: testName, passed: false, error: errorMsg });
    }
}

async function main(): Promise<void> {
    const baseUrl = process.argv[2];

    if (!baseUrl) {
        console.error('Usage: npx tsx tests/rest-endpoints.ts <base_url>');
        console.error('Example: npx tsx tests/rest-endpoints.ts http://localhost:3000');
        process.exit(1);
    }

    console.log(`\n${colors.blue}Testing AI Sandbox REST Endpoints${colors.reset}`);
    console.log(`Base URL: ${baseUrl}\n`);

    // Test 1: Health check
    await testEndpoint(baseUrl, 'GET', '/health', null, 200, 'Health check (GET /health)');

    // Test 2: Execute command - success
    await testEndpoint(
        baseUrl,
        'POST',
        '/exec',
        { command: 'echo "Hello, World!"' },
        200,
        'Execute command - echo success',
    );

    // Test 3: Execute command - error
    await testEndpoint(baseUrl, 'POST', '/exec', { command: 'exit 1' }, 500, 'Execute command - exit with error');

    // Test 4: Execute command - missing command
    await testEndpoint(baseUrl, 'POST', '/exec', {}, 400, 'Execute command - missing command field');

    // Test 5: Write file
    const testFilePath = '/tmp/test-sandbox-file.txt';
    const testContent = 'Hello from sandbox test!';
    await testEndpoint(
        baseUrl,
        'POST',
        '/write-file',
        { path: testFilePath, content: testContent },
        200,
        'Write file - success',
    );

    // Test 6: Read file
    await testEndpoint(baseUrl, 'POST', '/read-file', { path: testFilePath }, 200, 'Read file - success');

    // Test 7: Read non-existent file
    await testEndpoint(
        baseUrl,
        'POST',
        '/read-file',
        { path: '/tmp/non-existent-file-xyz.txt' },
        404,
        'Read file - non-existent file',
    );

    // Test 8: Read file - missing path
    await testEndpoint(baseUrl, 'POST', '/read-file', {}, 400, 'Read file - missing path field');

    // Test 9: Write file - missing path
    await testEndpoint(baseUrl, 'POST', '/write-file', { content: 'test' }, 400, 'Write file - missing path field');

    // Test 10: Write file - missing content
    await testEndpoint(
        baseUrl,
        'POST',
        '/write-file',
        { path: '/tmp/test.txt' },
        400,
        'Write file - missing content field',
    );

    // Test 11: List files
    await testEndpoint(baseUrl, 'POST', '/list-files', { path: '/tmp' }, 200, 'List files - success');

    // Test 12: List files - default path
    await testEndpoint(baseUrl, 'POST', '/list-files', {}, 200, 'List files - default path');

    // Test 13: List files - invalid directory
    await testEndpoint(
        baseUrl,
        'POST',
        '/list-files',
        { path: '/tmp/non-existent-directory-xyz' },
        500,
        'List files - invalid directory',
    );

    // Test 14: Execute code - JavaScript success
    await testEndpointWithOutputValidation(
        baseUrl,
        'POST',
        '/execute-code',
        { code: 'console.log("Hello from JS")', language: 'js' },
        200,
        'Hello from JS',
        'Execute code - JavaScript success (verify output)',
    );

    // Test 15: Execute code - JavaScript with newlines and number output
    await testEndpointWithOutputValidation(
        baseUrl,
        'POST',
        '/execute-code',
        { code: 'const x = 42;\nconsole.log(x);', language: 'js' },
        200,
        '42',
        'Execute code - JavaScript with newlines (verify number output)',
    );

    // Test 16: Execute code - TypeScript success with type annotation
    await testEndpointWithOutputValidation(
        baseUrl,
        'POST',
        '/execute-code',
        { code: 'const x: number = 42;\nconsole.log(x);', language: 'ts' },
        200,
        '42',
        'Execute code - TypeScript success (verify output)',
    );

    // Test 17: Execute code - Python success
    await testEndpointWithOutputValidation(
        baseUrl,
        'POST',
        '/execute-code',
        { code: 'print("Hello from Python")', language: 'py' },
        200,
        'Hello from Python',
        'Execute code - Python success (verify output)',
    );

    // Test 18: Execute code - Python with newlines and number output
    await testEndpointWithOutputValidation(
        baseUrl,
        'POST',
        '/execute-code',
        { code: 'x = 42\nprint(x)', language: 'py' },
        200,
        '42',
        'Execute code - Python with newlines (verify number output)',
    );

    // Test 19: Execute code - invalid language
    await testEndpoint(
        baseUrl,
        'POST',
        '/execute-code',
        { code: 'console.log("test")', language: 'ruby' },
        500,
        'Execute code - invalid language',
    );

    // Test 20: Execute code - missing code field
    await testEndpoint(baseUrl, 'POST', '/execute-code', { language: 'js' }, 400, 'Execute code - missing code field');

    // Test 21: Execute code - missing language field
    await testEndpoint(
        baseUrl,
        'POST',
        '/execute-code',
        { code: 'console.log("test")' },
        400,
        'Execute code - missing language field',
    );

    // Test 22: Execute code - empty code
    await testEndpoint(
        baseUrl,
        'POST',
        '/execute-code',
        { code: '', language: 'js' },
        400,
        'Execute code - empty code',
    );

    // Test 23: Execute code - JavaScript error
    await testEndpoint(
        baseUrl,
        'POST',
        '/execute-code',
        { code: 'throw new Error("Test error")', language: 'js' },
        500,
        'Execute code - JavaScript error',
    );

    // Test 24: Execute code - Python error
    await testEndpoint(
        baseUrl,
        'POST',
        '/execute-code',
        { code: 'raise ValueError("Test error")', language: 'py' },
        500,
        'Execute code - Python error',
    );

    // Test 25: Execute code - JavaScript working directory (pwd should be /sandbox/js-ts)
    await testEndpointWithOutputValidation(
        baseUrl,
        'POST',
        '/execute-code',
        {
            code: 'import { execSync } from "node:child_process";\nconst cwd = execSync("pwd").toString().trim();\nconsole.log(cwd);',
            language: 'js',
        },
        200,
        '/sandbox/js-ts',
        'Execute code - JavaScript working directory verification',
    );

    // Test 26: Execute code - TypeScript working directory (pwd should be /sandbox/js-ts)
    await testEndpointWithOutputValidation(
        baseUrl,
        'POST',
        '/execute-code',
        {
            code: 'import { execSync } from "node:child_process";\nconst cwd: string = execSync("pwd").toString().trim();\nconsole.log(cwd);',
            language: 'ts',
        },
        200,
        '/sandbox/js-ts',
        'Execute code - TypeScript working directory verification',
    );

    // Test 27: Execute code - Python working directory (pwd should be /sandbox/py)
    await testEndpointWithOutputValidation(
        baseUrl,
        'POST',
        '/execute-code',
        { code: 'import os\nprint(os.getcwd())', language: 'py' },
        200,
        '/sandbox/py',
        'Execute code - Python working directory verification',
    );

    // ========================================================================
    // Filesystem Endpoints Tests (GET/PUT/POST/DELETE /fs/*)
    // ========================================================================

    // Test 28: PUT /fs/* - Create new text file
    const testFsFile = '/test-fs-file.txt';
    const testFsContent = 'Hello from filesystem API!';
    await testFsEndpoint(baseUrl, 'PUT', `/fs${testFsFile}`, testFsContent, 200, 'PUT /fs/* - Create new text file');

    // Test 29: GET /fs/* - Read text file
    await testFsEndpoint(baseUrl, 'GET', `/fs${testFsFile}`, null, 200, 'GET /fs/* - Read text file');

    // Test 30: PUT /fs/* - Replace existing file
    await testFsEndpoint(
        baseUrl,
        'PUT',
        `/fs${testFsFile}`,
        'Updated content',
        200,
        'PUT /fs/* - Replace existing file',
    );

    // Test 31: POST /fs/* - Create directory with mkdir=1
    const testFsDir = '/test-fs-dir';
    await testFsEndpoint(baseUrl, 'POST', `/fs${testFsDir}?mkdir=1`, null, 201, 'POST /fs/* - Create directory');

    // Test 32: POST /fs/* - Create nested directory
    const testFsNestedDir = '/test-fs-parent/test-fs-child';
    await testFsEndpoint(
        baseUrl,
        'POST',
        `/fs${testFsNestedDir}?mkdir=1`,
        null,
        201,
        'POST /fs/* - Create nested directory',
    );

    // Test 33: GET /fs/* - List directory as JSON
    await testFsEndpoint(baseUrl, 'GET', '/fs/', null, 200, 'GET /fs/* - List root directory as JSON');

    // Test 34: GET /fs/* - List nested directory
    await testFsEndpoint(baseUrl, 'GET', '/fs/test-fs-parent', null, 200, 'GET /fs/* - List nested directory as JSON');

    // Test 35: PUT /fs/* - Create file in nested directory
    const testFsNestedFile = '/test-fs-parent/nested-file.txt';
    await testFsEndpoint(
        baseUrl,
        'PUT',
        `/fs${testFsNestedFile}`,
        'Nested file content',
        200,
        'PUT /fs/* - Create file in nested directory',
    );

    // Test 36: POST /fs/* - Append to file with append=1
    await testFsEndpoint(
        baseUrl,
        'POST',
        `/fs${testFsFile}?append=1`,
        ' Appended text!',
        200,
        'POST /fs/* - Append to existing file',
    );

    // Test 37: POST /fs/* - Append to non-existent file (should create)
    const testFsAppendNewFile = '/test-fs-append-new.txt';
    await testFsEndpoint(
        baseUrl,
        'POST',
        `/fs${testFsAppendNewFile}?append=1`,
        'Created by append',
        200,
        'POST /fs/* - Append to non-existent file (creates file)',
    );

    // Test 38: HEAD /fs/* - Get file metadata
    await testFsEndpoint(baseUrl, 'HEAD', `/fs${testFsFile}`, null, 200, 'HEAD /fs/* - Get file metadata');

    // Test 39: HEAD /fs/* - Get directory metadata
    await testFsEndpoint(baseUrl, 'HEAD', `/fs${testFsDir}`, null, 200, 'HEAD /fs/* - Get directory metadata');

    // Test 40: HEAD /fs/* - 404 for non-existent path
    await testFsEndpoint(
        baseUrl,
        'HEAD',
        '/fs/non-existent-xyz.txt',
        null,
        404,
        'HEAD /fs/* - Non-existent file (404)',
    );

    // Test 41: GET /fs/* - 404 for non-existent file
    await testFsEndpoint(baseUrl, 'GET', '/fs/non-existent-file-xyz.txt', null, 404, 'GET /fs/* - Non-existent file');

    // Test 42: GET /fs/* - 404 for non-existent directory
    await testFsEndpoint(baseUrl, 'GET', '/fs/non-existent-dir-xyz', null, 404, 'GET /fs/* - Non-existent directory');

    // Test 43: POST /fs/* - Missing mkdir/append parameter (400)
    await testFsEndpoint(
        baseUrl,
        'POST',
        '/fs/test-missing-param',
        'content',
        400,
        'POST /fs/* - Missing mkdir/append parameter',
    );

    // Test 44: POST /fs/* - Both mkdir and append (400)
    await testFsEndpoint(
        baseUrl,
        'POST',
        '/fs/test-both-params?mkdir=1&append=1',
        'content',
        400,
        'POST /fs/* - Cannot use both mkdir and append',
    );

    // Test 45: DELETE /fs/* - Delete file successfully
    await testFsEndpoint(baseUrl, 'DELETE', `/fs${testFsAppendNewFile}`, null, 200, 'DELETE /fs/* - Delete file');

    // Test 46: DELETE /fs/* - Delete non-existent file (should fail)
    await testFsEndpoint(
        baseUrl,
        'DELETE',
        '/fs/non-existent-to-delete.txt',
        null,
        500,
        'DELETE /fs/* - Delete non-existent file',
    );

    // Test 47: DELETE /fs/* - Delete empty directory
    await testFsEndpoint(baseUrl, 'DELETE', `/fs${testFsDir}`, null, 200, 'DELETE /fs/* - Delete empty directory');

    // Test 48: DELETE /fs/* - Delete non-empty directory without recursive (409)
    await testFsEndpoint(
        baseUrl,
        'DELETE',
        '/fs/test-fs-parent',
        null,
        409,
        'DELETE /fs/* - Non-empty directory without recursive (409)',
    );

    // Test 49: DELETE /fs/* - Delete non-empty directory with recursive=1
    await testFsEndpoint(
        baseUrl,
        'DELETE',
        '/fs/test-fs-parent?recursive=1',
        null,
        200,
        'DELETE /fs/* - Delete non-empty directory with recursive',
    );

    // Test 50: PUT /fs/* - Create binary-like file
    const testFsBinaryFile = '/test-binary.bin';
    const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0xff]);
    await testFsEndpoint(baseUrl, 'PUT', `/fs${testFsBinaryFile}`, binaryData, 200, 'PUT /fs/* - Create binary file');

    // Test 51: GET /fs/* - Read binary file
    await testFsEndpoint(baseUrl, 'GET', `/fs${testFsBinaryFile}`, null, 200, 'GET /fs/* - Read binary file');

    // Test 52: DELETE /fs/* - Cleanup binary file
    await testFsEndpoint(baseUrl, 'DELETE', `/fs${testFsBinaryFile}`, null, 200, 'DELETE /fs/* - Delete binary file');

    // Test 53: POST /fs/* - Create directory that already exists (idempotent)
    const testFsIdempotentDir = '/test-idempotent-dir';
    await testFsEndpoint(
        baseUrl,
        'POST',
        `/fs${testFsIdempotentDir}?mkdir=1`,
        null,
        201,
        'POST /fs/* - Create directory (first time)',
    );
    await testFsEndpoint(
        baseUrl,
        'POST',
        `/fs${testFsIdempotentDir}?mkdir=1`,
        null,
        201,
        'POST /fs/* - Create directory (already exists, idempotent)',
    );

    // Test 54: DELETE /fs/* - Cleanup idempotent directory
    await testFsEndpoint(
        baseUrl,
        'DELETE',
        `/fs${testFsIdempotentDir}`,
        null,
        200,
        'DELETE /fs/* - Delete idempotent directory',
    );

    // Test 55: GET /fs/* - Test file with special characters in name
    const testFsSpecialFile = '/test-file-with-spaces and-special_chars.txt';
    await testFsEndpoint(
        baseUrl,
        'PUT',
        `/fs${testFsSpecialFile}`,
        'Special filename',
        200,
        'PUT /fs/* - Create file with special characters',
    );
    await testFsEndpoint(
        baseUrl,
        'GET',
        `/fs${testFsSpecialFile}`,
        null,
        200,
        'GET /fs/* - Read file with special characters',
    );
    await testFsEndpoint(
        baseUrl,
        'DELETE',
        `/fs${testFsSpecialFile}`,
        null,
        200,
        'DELETE /fs/* - Delete file with special characters',
    );

    // Test 56: Cleanup - Delete test files
    await testFsEndpoint(baseUrl, 'DELETE', `/fs${testFsFile}`, null, 200, 'Cleanup - Delete test-fs-file.txt');

    // Summary
    console.log(`\n${colors.blue}Test Summary${colors.reset}`);
    const passed = results.filter((r) => r.passed).length;
    const total = results.length;
    const percentage = Math.round((passed / total) * 100);

    console.log(`Passed: ${colors.green}${passed}${colors.reset}/${total} (${percentage}%)`);

    if (passed < total) {
        console.log(`\n${colors.red}Failed tests:${colors.reset}`);
        results
            .filter((r) => !r.passed)
            .forEach((r) => {
                console.log(`  - ${r.name}: ${r.error}`);
            });
    }

    console.log('');
    process.exit(passed === total ? 0 : 1);
}

main().catch((error) => {
    console.error('Test script error:', error);
    process.exit(1);
});
