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

        const data = await response.json() as { stdout?: string; stderr?: string };

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

async function main(): Promise<void> {
    const baseUrl = process.argv[2];

    if (!baseUrl) {
        console.error('Usage: npx tsx tests/rest-endpoints.ts <base_url>');
        console.error('Example: npx tsx tests/rest-endpoints.ts http://localhost:3000');
        process.exit(1);
    }

    console.log(`\n${colors.blue}Testing Sandbox Actor REST Endpoints${colors.reset}`);
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
    await testEndpoint(
        baseUrl,
        'POST',
        '/exec',
        { command: 'exit 1' },
        500,
        'Execute command - exit with error',
    );

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
    await testEndpoint(
        baseUrl,
        'POST',
        '/read-file',
        { path: testFilePath },
        200,
        'Read file - success',
    );

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
    await testEndpoint(
        baseUrl,
        'POST',
        '/write-file',
        { content: 'test' },
        400,
        'Write file - missing path field',
    );

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
    await testEndpoint(
        baseUrl,
        'POST',
        '/list-files',
        { path: '/tmp' },
        200,
        'List files - success',
    );

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
    await testEndpoint(baseUrl, 'POST', '/execute-code', { code: 'console.log("test")' }, 400, 'Execute code - missing language field');

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

    // Summary
    console.log(`\n${colors.blue}Test Summary${colors.reset}`);
    const passed = results.filter((r) => r.passed).length;
    const total = results.length;
    const percentage = Math.round((passed / total) * 100);

    console.log(`Passed: ${colors.green}${passed}${colors.reset}/${total} (${percentage}%)`);

    if (passed < total) {
        console.log(`\n${colors.red}Failed tests:${colors.reset}`);
        results.filter((r) => !r.passed).forEach((r) => {
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
