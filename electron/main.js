const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync, execSync } = require('child_process');

/**
 * O processo Electron não lê `.env` sozinho (ao contrário do Python com python-dotenv).
 * Carrega a raiz do repo sem sobrescrever variáveis já definidas no sistema/atalho.
 */
function loadRootEnvFile() {
    const envPath = path.join(__dirname, '../.env');
    if (!fs.existsSync(envPath)) return;
    let raw;
    try {
        raw = fs.readFileSync(envPath, 'utf8');
    } catch {
        return;
    }
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        ) {
            val = val.slice(1, -1);
        }
        if (!key || process.env[key] !== undefined) continue;
        process.env[key] = val;
    }
}

loadRootEnvFile();

// Use ANGLE D3D11 backend - more stable on Windows while keeping WebGL working
// This fixes "GPU state invalid after WaitForGetOffsetInRange" error
app.commandLine.appendSwitch('use-angle', 'd3d11');
app.commandLine.appendSwitch('enable-features', 'Vulkan');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

let mainWindow;
let pythonProcess;
let cloudflaredProcess;

const AMBIENTE_DIR = path.join(__dirname, '../dev/ambiente');

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
 * Cloudflare Tunnel (n8n, etc.): cloudflared.exe em dev/ambiente/ ou CLOUDFLARED_EXE.
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
            `[Cloudflared] Não encontrado: ${exe}. Coloque cloudflared.exe em dev/ambiente/ ou defina CLOUDFLARED_EXE.`
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


/** Caminho do CLI: ORBITAL_DOCKER_CLI → docker.exe do Docker Desktop (Windows) → `docker` no PATH */
let _dockerCliResolved;
function resolveDockerCli() {
    if (_dockerCliResolved !== undefined) return _dockerCliResolved;
    const fromEnv = (process.env.ORBITAL_DOCKER_CLI || '').trim();
    if (fromEnv && fs.existsSync(fromEnv)) {
        _dockerCliResolved = fromEnv;
        return _dockerCliResolved;
    }
    if (process.platform === 'win32') {
        const pf = process.env.ProgramFiles || 'C:\\Program Files';
        const bundled = path.join(pf, 'Docker', 'Docker', 'resources', 'bin', 'docker.exe');
        if (fs.existsSync(bundled)) {
            _dockerCliResolved = bundled;
            return _dockerCliResolved;
        }
    }
    _dockerCliResolved = 'docker';
    return _dockerCliResolved;
}

function dockerDaemonReachable() {
    return new Promise((resolve) => {
        const cli = resolveDockerCli();
        const c = spawn(cli, ['info'], { shell: false, windowsHide: true });
        c.on('error', () => resolve(false));
        c.on('exit', (code) => resolve(code === 0));
    });
}

function sleepMs(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/** Windows: `…\Docker\Docker\Docker Desktop.exe` ou ORBITAL_DOCKER_DESKTOP_EXE */
function resolveDockerDesktopExe() {
    const fromEnv = (process.env.ORBITAL_DOCKER_DESKTOP_EXE || '').trim();
    if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
    if (process.platform !== 'win32') return null;
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const candidate = path.join(pf, 'Docker', 'Docker', 'Docker Desktop.exe');
    return fs.existsSync(candidate) ? candidate : null;
}

/**
 * Sem daemon ativo, `docker start` falha. No Windows podemos abrir o Docker Desktop e esperar.
 * Desligar auto-abertura: ORBITAL_START_DOCKER_DESKTOP=0
 */
function tryLaunchDockerDesktopWindows() {
    if (process.env.ORBITAL_START_DOCKER_DESKTOP === '0') {
        writeOrbitalLog('info', '[Docker] Não abrir Docker Desktop (ORBITAL_START_DOCKER_DESKTOP=0).');
        return false;
    }
    const exe = resolveDockerDesktopExe();
    if (!exe) {
        writeOrbitalLog(
            'warn',
            '[Docker] Docker Desktop.exe não encontrado. Instala o Docker Desktop ou define ORBITAL_DOCKER_DESKTOP_EXE.'
        );
        return false;
    }
    try {
        const child = spawn(exe, [], { detached: true, stdio: 'ignore' });
        child.unref();
        writeOrbitalLog('info', `[Docker] A abrir Docker Desktop (daemon estava inacessível)…`);
        return true;
    } catch (e) {
        writeOrbitalLog('error', `[Docker] Falha ao abrir Docker Desktop: ${e.message}`);
        return false;
    }
}

async function waitForDockerDaemon(maxMs, intervalMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
        if (await dockerDaemonReachable()) return true;
        await sleepMs(intervalMs);
    }
    return false;
}

function runDockerStart(name) {
    const cli = resolveDockerCli();
    writeOrbitalLog('info', `[Docker] docker start "${name}" (${cli})…`);
    const child = spawn(cli, ['start', name], { shell: false, windowsHide: true });
    child.stdout.on('data', (data) => {
        const s = String(data).trim();
        if (s) writeOrbitalLog('info', `[Docker] ${name}: ${s}`);
    });
    child.stderr.on('data', (data) => {
        const s = String(data).trim();
        if (s) writeOrbitalLog('warn', `[Docker] ${name}: ${s}`);
    });
    child.on('exit', (code) => {
        if (code === 0) {
            writeOrbitalLog('info', `[Docker] Container "${name}" OK (iniciado ou já em execução).`);
        } else {
            writeOrbitalLog(
                'warn',
                `[Docker] docker start "${name}" saiu com código ${code}. Container existe?`
            );
        }
    });
    child.on('error', (err) => {
        writeOrbitalLog('error', `[Docker] Não foi possível executar docker para "${name}": ${err.message}`);
    });
}

/**
 * `docker start` no arranque (ex.: n8n). Não para containers ao fechar o app.
 * Desligar: ORBITAL_SKIP_DOCKER_START=1
 * Nomes (vírgula): ORBITAL_DOCKER_CONTAINERS=n8n (default: n8n)
 * Windows: se o daemon não responder, tenta abrir Docker Desktop (exceto ORBITAL_START_DOCKER_DESKTOP=0).
 * Espera: ORBITAL_DOCKER_WAIT_MS (default 180000)
 */
function startDockerContainers() {
    if (process.env.ORBITAL_SKIP_DOCKER_START === '1') {
        writeOrbitalLog('info', '[Docker] Ignorado (ORBITAL_SKIP_DOCKER_START=1).');
        return;
    }
    const raw = (process.env.ORBITAL_DOCKER_CONTAINERS || 'n8n').trim();
    if (!raw) {
        writeOrbitalLog('info', '[Docker] ORBITAL_DOCKER_CONTAINERS vazio — nada a iniciar.');
        return;
    }
    const names = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const waitRaw = (process.env.ORBITAL_DOCKER_WAIT_MS || '180000').trim();
    const maxWait = Math.max(5000, parseInt(waitRaw, 10) || 180000);

    void (async () => {
        const cli = resolveDockerCli();
        writeOrbitalLog('info', `[Docker] CLI: ${cli}`);
        let ok = await dockerDaemonReachable();
        if (!ok && process.platform === 'win32') {
            tryLaunchDockerDesktopWindows();
            writeOrbitalLog('info', `[Docker] A aguardar daemon (até ${Math.round(maxWait / 1000)}s)…`);
            ok = await waitForDockerDaemon(maxWait, 2000);
        }
        if (!ok) {
            writeOrbitalLog(
                'warn',
                '[Docker] Daemon indisponível — não foi possível iniciar containers. Abre o Docker Desktop (ou define ORBITAL_START_DOCKER_DESKTOP=0 e abre manualmente).'
            );
            return;
        }
        for (const name of names) {
            runDockerStart(name);
        }
    })();
}

function envFlagOn(name) {
    const v = (process.env[name] || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
}

/** Opcional: ORBITAL_DOCKER_STOP_ON_QUIT=1 — mesma lista que ORBITAL_DOCKER_CONTAINERS (default n8n). */
function stopDockerContainersOnQuit() {
    if (!envFlagOn('ORBITAL_DOCKER_STOP_ON_QUIT')) return;
    const raw = (process.env.ORBITAL_DOCKER_CONTAINERS || 'n8n').trim();
    if (!raw) return;
    const names = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const cli = resolveDockerCli();
    writeOrbitalLog('info', `[Docker] ORBITAL_DOCKER_STOP_ON_QUIT: a parar ${names.join(', ')}…`);
    for (const name of names) {
        try {
            const r = spawnSync(cli, ['stop', name], { shell: false, windowsHide: true, encoding: 'utf8' });
            if (r.status === 0) {
                writeOrbitalLog('info', `[Docker] Container "${name}" parado (ORBITAL_DOCKER_STOP_ON_QUIT).`);
            } else {
                const err = (r.stderr || r.stdout || '').trim();
                writeOrbitalLog(
                    'warn',
                    `[Docker] docker stop "${name}" saiu com ${r.status}${err ? `: ${err}` : ''}`
                );
            }
        } catch (e) {
            writeOrbitalLog('warn', `[Docker] docker stop "${name}": ${e.message}`);
        }
    }
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

    startDockerContainers();
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
    stopDockerContainersOnQuit();

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
