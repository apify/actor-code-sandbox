import type { Server as HTTPServer } from 'node:http';
import * as os from 'node:os';

import { log } from 'apify';
import * as pty from 'node-pty';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';

interface TerminalSession {
    ptyProcess: pty.IPty;
    ws: WebSocket;
}

/**
 * Initialize WebSocket server for shell terminal access
 */
export function initializeShellServer(server: HTTPServer): void {
    const wss = new WebSocketServer({ noServer: true });

    // Track active terminal sessions
    const sessions = new Map<WebSocket, TerminalSession>();

    // Handle WebSocket upgrade
    server.on('upgrade', (req, socket, head) => {
        if (req.url === '/shell/ws') {
            wss.handleUpgrade(req, socket, head, (ws) => {
                wss.emit('connection', ws, req);
            });
        }
    });

    wss.on('connection', (ws: WebSocket) => {
        log.debug('New terminal connection');

        try {
            // Spawn shell process with PTY
            const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
            // Use /sandbox as default working directory unless in local mode
            const isLocalMode = process.env.MODE === 'local';
            const defaultCwd = isLocalMode ? process.cwd() : '/sandbox';

            const ptyProcess = pty.spawn(shell, [], {
                name: 'xterm-256color',
                cols: 120,
                rows: 40,
                cwd: defaultCwd,
                env: process.env as Record<string, string>,
            });

            // Store session
            const session: TerminalSession = { ptyProcess, ws };
            sessions.set(ws, session);

            // Send initial data and terminal ready signal
            ws.send(JSON.stringify({ type: 'ready' }));

            // Forward shell output to WebSocket
            ptyProcess.onData((data: string) => {
                if (ws.readyState === 1) {
                    // WebSocket.OPEN
                    ws.send(JSON.stringify({ type: 'data', payload: data }));
                }
            });

            // Handle WebSocket messages
            ws.on('message', (message: Buffer) => {
                try {
                    const msg = JSON.parse(message.toString());

                    if (msg.type === 'data') {
                        // Write user input to shell
                        ptyProcess.write(msg.payload);
                    } else if (msg.type === 'resize') {
                        // Handle terminal resize
                        const { cols, rows } = msg;
                        if (cols && rows) {
                            ptyProcess.resize(cols, rows);
                            log.debug(`Terminal resized to ${cols}x${rows}`);
                        }
                    }
                } catch (error) {
                    log.warning('Error parsing WebSocket message', { error });
                }
            });

            // Handle WebSocket close
            ws.on('close', () => {
                log.debug('Terminal connection closed');
                sessions.delete(ws);
                try {
                    ptyProcess.kill();
                } catch {
                    // Process may already be closed
                }
            });

            // Handle WebSocket error
            ws.on('error', (wsError: Error) => {
                log.warning('WebSocket error', { error: wsError.message });
                sessions.delete(ws);
                try {
                    ptyProcess.kill();
                } catch {
                    // Process may already be closed
                }
            });

            // Handle PTY process exit
            ptyProcess.onExit(() => {
                log.debug('Shell process exited');
                sessions.delete(ws);
                if (ws.readyState === 1) {
                    ws.send(JSON.stringify({ type: 'exit' }));
                    ws.close();
                }
            });
        } catch (error) {
            log.error('Error initializing shell terminal', { error });
            ws.send(JSON.stringify({ type: 'error', message: 'Failed to initialize terminal' }));
            ws.close();
        }
    });

    wss.on('error', (error: Error) => {
        log.error('WebSocket server error', { error: error.message });
    });

    log.info('Shell WebSocket server initialized');
}

/**
 * Get shell HTML page
 */
export function getShellHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Shell Terminal</title>
    <link rel="stylesheet" href="/xterm/xterm.css" />
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        html, body {
            width: 100%;
            height: 100%;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: #1e1e1e;
        }
        
        #terminal {
            width: 100%;
            height: 100%;
            overflow: hidden;
        }
        
        .connection-status {
            position: fixed;
            top: 10px;
            right: 10px;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 1000;
            pointer-events: none;
        }
        
        .connection-status.connected {
            background: #22c55e;
            color: white;
        }
        
        .connection-status.disconnected {
            background: #ef4444;
            color: white;
        }
        
        .connection-status.connecting {
            background: #f59e0b;
            color: white;
        }
    </style>
</head>
<body>
    <div id="terminal"></div>
    <div id="status" class="connection-status connecting">Loading terminal...</div>

    <script src="/xterm/xterm.js" defer></script>
    <script src="/xterm-addon/addon-fit.js" defer></script>
    <script defer>
        // Debug: Log what gets set in window
        console.log('Script loading started');
        
        // Wait for both Terminal and FitAddon to be available
        function waitForLibraries(callback, maxWait = 5000) {
            const startTime = Date.now();
            const checkLibraries = () => {
                // Get Terminal (direct global)
                const Terminal = window.Terminal;
                
                // FitAddon might be nested in an object, so check both possibilities
                let FitAddon = window.FitAddon;
                if (FitAddon && typeof FitAddon === 'object' && FitAddon.FitAddon) {
                    FitAddon = FitAddon.FitAddon;
                }
                
                const hasTerminal = typeof Terminal === 'function';
                const hasFitAddon = typeof FitAddon === 'function';
                
                if (hasTerminal && hasFitAddon) {
                    console.log('✓ xterm libraries loaded successfully');
                    callback(Terminal, FitAddon);
                } else if (Date.now() - startTime > maxWait) {
                    console.error('Timeout waiting for xterm libraries', { 
                        hasTerminal, 
                        hasFitAddon,
                        Terminal: typeof Terminal,
                        FitAddon: typeof window.FitAddon
                    });
                    document.getElementById('status').textContent = 'Error: Terminal libraries failed to load. Check console.';
                } else {
                    console.log('Waiting for libraries...', { hasTerminal, hasFitAddon });
                    setTimeout(checkLibraries, 50);
                }
            };
            checkLibraries();
        }

        function initTerminal(Terminal, FitAddon) {
            try {
                console.log('Initializing terminal');
                
                const term = new Terminal({
                    cursorBlink: true,
                    theme: {
                        background: '#1e1e1e',
                        foreground: '#d4d4d4',
                    },
                });

                const fitAddon = new FitAddon();
                term.loadAddon(fitAddon);
                term.open(document.getElementById('terminal'));
                fitAddon.fit();

                const statusEl = document.getElementById('status');
                let ws = null;

                function updateStatus(state) {
                    statusEl.className = 'connection-status ' + state;
                    if (state === 'connected') {
                        statusEl.textContent = 'Connected';
                    } else if (state === 'disconnected') {
                        statusEl.textContent = 'Disconnected';
                    } else if (state === 'connecting') {
                        statusEl.textContent = 'Connecting...';
                    }
                }

                function connect() {
                    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                    const wsUrl = protocol + '//' + window.location.host + '/shell/ws';

                    try {
                        ws = new WebSocket(wsUrl);

                        ws.onopen = () => {
                            updateStatus('connected');
                            term.write('\\r\\n✓ Connected to shell\\r\\n');
                        };

                        ws.onmessage = (event) => {
                            try {
                                const msg = JSON.parse(event.data);

                                if (msg.type === 'data') {
                                    term.write(msg.payload);
                                } else if (msg.type === 'ready') {
                                    term.write('\\r\\n');
                                } else if (msg.type === 'exit') {
                                    term.write('\\r\\n\\r\\n✓ Shell closed\\r\\n');
                                    setTimeout(() => {
                                        updateStatus('disconnected');
                                    }, 1000);
                                } else if (msg.type === 'error') {
                                    term.write('\\r\\n✗ Error: ' + msg.message + '\\r\\n');
                                    updateStatus('disconnected');
                                }
                            } catch (error) {
                                console.error('Error parsing message:', error);
                            }
                        };

                        ws.onerror = (error) => {
                            console.error('WebSocket error:', error);
                            updateStatus('disconnected');
                            term.write('\\r\\n✗ Connection error\\r\\n');
                        };

                        ws.onclose = () => {
                            updateStatus('disconnected');
                            term.write('\\r\\n✓ Connection closed. Reconnecting in 3 seconds...\\r\\n');
                            setTimeout(connect, 3000);
                        };
                    } catch (error) {
                        console.error('Failed to create WebSocket:', error);
                        updateStatus('disconnected');
                        setTimeout(connect, 3000);
                    }
                }

                term.onData((data) => {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'data', payload: data }));
                    }
                });

                window.addEventListener('resize', () => {
                    fitAddon.fit();
                    const { cols, rows } = term;
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
                    }
                });

                updateStatus('connecting');
                connect();
            } catch (error) {
                console.error('Failed to initialize terminal:', error);
                document.getElementById('status').textContent = 'Error loading terminal';
            }
        }

        // Initialize terminal when libraries are ready
        waitForLibraries(initTerminal);
    </script>
</body>
</html>`;
}
