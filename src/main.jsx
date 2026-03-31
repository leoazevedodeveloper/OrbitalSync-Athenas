import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

function setupRendererLogging() {
    try {
        const electron = window.require ? window.require('electron') : null;
        const ipcRenderer = electron?.ipcRenderer;
        if (!ipcRenderer?.send) return;

        const safeToString = (v) => {
            if (v instanceof Error) return v.stack || v.message || 'Error';
            if (typeof v === 'string') return v;
            try {
                return JSON.stringify(v);
            } catch {
                return String(v);
            }
        };

        const sendLog = (level, args) => {
            try {
                ipcRenderer.send('orbital-renderer-log', {
                    level,
                    message: args.map(safeToString).join(' '),
                });
            } catch {
                // Do nothing: nunca travar a UI por causa de logs.
            }
        };

        // Redireciona console do renderer para arquivo via IPC.
        console.log = (...args) => sendLog('info', args);
        console.warn = (...args) => sendLog('warn', args);
        console.error = (...args) => sendLog('error', args);
        console.debug = (...args) => sendLog('debug', args);

        // Erros globais do renderer.
        window.addEventListener('error', (event) => {
            try {
                const loc = event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : '';
                const stack = event.error?.stack || '';
                sendLog('error', ['[window.onerror]', event.message || String(event), loc, stack].filter(Boolean));
            } catch {
                // ignore
            }
        });

        window.addEventListener('unhandledrejection', (event) => {
            try {
                const reason = event.reason;
                const stack = reason?.stack || '';
                sendLog('error', ['[unhandledrejection]', safeToString(reason), stack].filter(Boolean));
            } catch {
                // ignore
            }
        });
    } catch {
        // ignore
    }
}

setupRendererLogging();

// App precisa ser importado dinamicamente para garantir que logging está instalado antes.
import('./App.jsx').then(({ default: App }) => {
    ReactDOM.createRoot(document.getElementById('root')).render(
        <App />,
    );
});
