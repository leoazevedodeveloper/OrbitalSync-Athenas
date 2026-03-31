const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

// Use ANGLE D3D11 backend - more stable on Windows while keeping WebGL working
// This fixes "GPU state invalid after WaitForGetOffsetInRange" error
app.commandLine.appendSwitch('use-angle', 'd3d11');
app.commandLine.appendSwitch('enable-features', 'Vulkan');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

let mainWindow;
let pythonProcess;
let cloudflaredProcess;

const AMBIENTE_DIR = path.join(__dirname, '../ambiente');

// Logs do Electron/main para evitar travar o DevTools com spam (cloudflared/python).
// Tudo vai para 1 arquivo só (com rotação).
const LOG_DIR = path.join(__dirname, '../logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

function createRotatingFileWriter(fileName, { maxBytes = 10 * 1024 * 1024, maxFiles = 3 } = {}) {
    const filePath = path.join(LOG_DIR, fileName);
    let size = 0;
    try {
        if (fs.existsSync(filePath)) size = fs.statSync(filePath).size;
    } catch {
        size = 0;
    }

    let stream = fs.createWriteStream(filePath, { flags: 'a' });

    const rotate = () => {
        try {
            stream.end();
        } catch {
            // ignore
        }
        try {
            for (let i = maxFiles; i >= 1; i -= 1) {
                const src = `${filePath}.${i}`;
                const dest = `${filePath}.${i + 1}`;
                if (fs.existsSync(src)) fs.renameSync(src, dest);
            }
            if (fs.existsSync(filePath)) fs.renameSync(filePath, `${filePath}.1`);
        } catch {
            // Fallback: truncar (mantém "integro" o app mesmo se rotação falhar)
            try {
                fs.writeFileSync(filePath, '');
            } catch {
                // ignore
            }
        }
        try {
            stream = fs.createWriteStream(filePath, { flags: 'a' });
            size = 0;
        } catch {
            // ignore
        }
    };

    return (level, message) => {
        const ts = new Date().toISOString();
        const line = `${ts} [${level}] ${String(message ?? '')}${String(message ?? '').endsWith('\n') ? '' : '\n'}`;
        try {
            if (stream && size > maxBytes) rotate();
            if (!stream) stream = fs.createWriteStream(filePath, { flags: 'a' });
            stream.write(line);
            size += Buffer.byteLength(line, 'utf8');
        } catch {
            // Swallow: não usar console para não travar DevTools.
        }
    };
}

const writeOrbitalLog = createRotatingFileWriter('orbitalsync.log');

/**
 * Cloudflare Tunnel (n8n, etc.): cloudflared.exe em ambiente/ ou CLOUDFLARED_EXE.
 * Desligar: ORBITAL_SKIP_CLOUDFLARED=1
 * Túnel: CLOUDFLARED_TUNNEL=n8n (default)
 */
function sendOrbitalBootHints() {
    if (!mainWindow?.webContents || mainWindow.webContents.isDestroyed()) return;
    let cloudflared = 'unavailable';
    if (process.env.ORBITAL_SKIP_CLOUDFLARED === '1') {
        cloudflared = 'skipped';
    } else if (cloudflaredProcess) {
        cloudflared = 'running';
    }
    try {
        mainWindow.webContents.send('orbital-boot-electron', { cloudflared });
    } catch (e) {
        writeOrbitalLog('warn', `[Orbital] orbital-boot-electron send failed: ${e.message}`);
    }
}

function startCloudflaredTunnel() {
    if (process.env.ORBITAL_SKIP_CLOUDFLARED === '1') {
        writeOrbitalLog('info', '[Cloudflared] Ignorado (ORBITAL_SKIP_CLOUDFLARED=1).');
        return;
    }
    const tunnelName = (process.env.CLOUDFLARED_TUNNEL || 'n8n').trim();
    let exe;
    if (process.env.CLOUDFLARED_EXE) {
        exe = process.env.CLOUDFLARED_EXE;
    } else if (process.platform === 'win32') {
        exe = path.join(AMBIENTE_DIR, 'cloudflared.exe');
    } else {
        exe = 'cloudflared';
    }

    if (process.platform === 'win32' && !fs.existsSync(exe)) {
        writeOrbitalLog(
            'warn',
            `[Cloudflared] Não encontrado: ${exe}. Coloque cloudflared.exe em ambiente/ ou defina CLOUDFLARED_EXE.`
        );
        return;
    }

    writeOrbitalLog('info', `Iniciando túnel "${tunnelName}" (cwd: ${AMBIENTE_DIR})…`);
    cloudflaredProcess = spawn(exe, ['tunnel', 'run', tunnelName], {
        cwd: AMBIENTE_DIR,
        shell: false,
    });

    cloudflaredProcess.stdout.on('data', (data) => {
        // data é Buffer/Uint8Array: convertendo para string.
        writeOrbitalLog('info', String(data));
    });
    cloudflaredProcess.stderr.on('data', (data) => {
        writeOrbitalLog('error', String(data));
    });
    cloudflaredProcess.on('exit', (code, signal) => {
        writeOrbitalLog('warn', `Processo terminou (code=${code}, signal=${signal}).`);
        cloudflaredProcess = null;
    });
    cloudflaredProcess.on('error', (err) => {
        writeOrbitalLog('error', `Falha ao iniciar: ${err.message}`);
        cloudflaredProcess = null;
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        autoHideMenuBar: true,
        fullscreen: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false, // For simple IPC/Socket.IO usage
        },
        backgroundColor: '#000000',
        frame: false, // Frameless for custom UI
        titleBarStyle: 'hidden',
        show: false, // Don't show until ready
    });

    // In dev, load Vite server. In prod, load index.html
    const isDev = process.env.NODE_ENV !== 'production';

    const loadFrontend = (retries = 3) => {
        const url = isDev ? 'http://localhost:5173' : null;
        const loadPromise = isDev
            ? mainWindow.loadURL(url)
            : mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));

        loadPromise
            .then(() => {
                windowWasShown = true;
                mainWindow.show();
                mainWindow.setFullScreen(true);
                setTimeout(() => sendOrbitalBootHints(), 500);
                if (isDev) {
                    // mainWindow.webContents.openDevTools();
                }
            })
            .catch((err) => {
                writeOrbitalLog('error', `Failed to load frontend: ${err.message}`);
                if (retries > 0) {
                    writeOrbitalLog('warn', `Retrying in 1 second... (${retries} retries left)`);
                    setTimeout(() => loadFrontend(retries - 1), 1000);
                } else {
                    writeOrbitalLog('error', 'Failed to load frontend after all retries. Keeping window open.');
                    windowWasShown = true;
                    mainWindow.show(); // Show anyway so user sees something
                    mainWindow.setFullScreen(true);
                }
            });
    };

    loadFrontend();

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function startPythonBackend() {
    const scriptPath = path.join(__dirname, '../backend/server.py');
    writeOrbitalLog('info', `Starting Python backend: ${scriptPath}`);

    // Assuming 'python' is in PATH. In prod, this would be the executable.
    pythonProcess = spawn('python', [scriptPath], {
        cwd: path.join(__dirname, '../backend'),
    });

    pythonProcess.stdout.on('data', (data) => {
        writeOrbitalLog('info', String(data));
    });

    pythonProcess.stderr.on('data', (data) => {
        writeOrbitalLog('error', String(data));
    });
}

app.whenReady().then(() => {
    // Recebe logs do renderer (App/React) e escreve em arquivo.
    // Assim, "qualquer console.*" do renderer não aparece no DevTools.
    ipcMain.on('orbital-renderer-log', (_event, payload) => {
        const level = String(payload?.level ?? 'info');
        const message = payload?.message ?? '';
        writeOrbitalLog(level, message);
    });

    ipcMain.on('window-minimize', () => {
        if (mainWindow) mainWindow.minimize();
    });

    ipcMain.on('window-maximize', () => {
        if (mainWindow) {
            if (mainWindow.isFullScreen()) {
                mainWindow.setFullScreen(false);
            } else {
                mainWindow.setFullScreen(true);
            }
        }
    });

    ipcMain.on('window-close', () => {
        if (mainWindow) mainWindow.close();
    });

    /** Diálogo nativo para escolher .exe / app (renderer: ipcRenderer.invoke('pick-executable')) */
    ipcMain.handle('pick-executable', async () => {
        if (!mainWindow) return null;
        const isWin = process.platform === 'win32';
        const r = await dialog.showOpenDialog(mainWindow, {
            title: isWin ? 'Selecionar executável' : 'Selecionar aplicativo',
            properties: ['openFile'],
            filters: isWin
                ? [
                      { name: 'Executáveis', extensions: ['exe', 'bat', 'cmd'] },
                      { name: 'Todos os arquivos', extensions: ['*'] },
                  ]
                : [{ name: 'Todos os arquivos', extensions: ['*'] }],
        });
        if (r.canceled || !r.filePaths?.length) return null;
        return r.filePaths[0];
    });

    startCloudflaredTunnel();

    /**
     * Interface primeiro, backend em paralelo: o renderer mostra o boot real enquanto o Python sobe.
     * Antes: waitForBackend() bloqueava createWindow até /status — sensação de “nada acontece”.
     */
    createWindow();

    checkBackendPort(8000).then((isTaken) => {
        if (isTaken) {
            writeOrbitalLog('warn', 'Porta 8000 em uso — assumindo backend já iniciado manualmente.');
            return;
        }
        writeOrbitalLog('info', '[Electron] Iniciando backend Python em paralelo com a janela.');
        startPythonBackend();
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

function checkBackendPort(port) {
    return new Promise((resolve) => {
        const net = require('net');
        const server = net.createServer();
        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(true);
            } else {
                resolve(false);
            }
        });
        server.once('listening', () => {
            server.close();
            resolve(false);
        });
        server.listen(port);
    });
}

let windowWasShown = false;

app.on('window-all-closed', () => {
    // Only quit if the window was actually shown at least once
    // This prevents quitting during startup if window creation fails
    if (process.platform !== 'darwin' && windowWasShown) {
        app.quit();
    } else if (!windowWasShown) {
        writeOrbitalLog('warn', 'Window was never shown - keeping app alive to allow retries');
    }
});

app.on('will-quit', () => {
    writeOrbitalLog('info', 'App closing... Encerrando backend e Cloudflared.');

    if (cloudflaredProcess) {
        if (process.platform === 'win32') {
            try {
                execSync(`taskkill /pid ${cloudflaredProcess.pid} /f /t`);
            } catch (e) {
                writeOrbitalLog('error', `Falha ao encerrar cloudflared: ${e.message}`);
            }
        } else {
            cloudflaredProcess.kill('SIGKILL');
        }
        cloudflaredProcess = null;
    }

    if (pythonProcess) {
        if (process.platform === 'win32') {
            try {
                execSync(`taskkill /pid ${pythonProcess.pid} /f /t`);
            } catch (e) {
                writeOrbitalLog('error', `Failed to kill python process: ${e.message}`);
            }
        } else {
            pythonProcess.kill('SIGKILL');
        }
        pythonProcess = null;
    }
});
