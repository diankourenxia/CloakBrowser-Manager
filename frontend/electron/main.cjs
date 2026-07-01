const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const DEFAULT_PORT = 37680;
const BACKEND_START_TIMEOUT_MS = 45_000;

let mainWindow = null;
let backendProcess = null;

function appRoot() {
  return app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "../..");
}

function candidatePythonBins(root) {
  const configured = process.env.PYTHON_BIN ? [process.env.PYTHON_BIN] : [];
  if (process.platform === "win32") {
    return [
      ...configured,
      path.join(root, ".venv", "Scripts", "python.exe"),
      "python",
      "py",
    ];
  }
  return [
    ...configured,
    path.join(root, ".venv", "bin", "python"),
    "python3",
    "python",
  ];
}

function canRunPython(bin) {
  return new Promise((resolve) => {
    const child = spawn(bin, ["-c", "import sys; print(sys.version)"], {
      stdio: "ignore",
      shell: false,
    });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

async function resolvePythonBin(root) {
  for (const bin of candidatePythonBins(root)) {
    if (await canRunPython(bin)) return bin;
  }
  throw new Error(
    "Python was not found. Install Python 3.12+ and run `pip install -r backend/requirements.txt`, or set PYTHON_BIN.",
  );
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findPort() {
  const configured = Number(process.env.CLOAK_PORT || 0);
  if (configured > 0 && await isPortFree(configured)) return configured;

  for (let offset = 0; offset < 100; offset += 1) {
    const port = DEFAULT_PORT + offset;
    if (await isPortFree(port)) return port;
  }
  throw new Error("No free local port was available for the CloakBrowser backend.");
}

function waitForBackend(baseUrl) {
  const deadline = Date.now() + BACKEND_START_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`${baseUrl}/api/status`, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      req.on("error", retry);
      req.setTimeout(1500, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() > deadline) {
        reject(new Error("Timed out while starting the local backend."));
        return;
      }
      setTimeout(tick, 500);
    };

    tick();
  });
}

function appendLog(logPath, chunk) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, chunk);
}

async function startBackend() {
  const root = appRoot();
  const port = await findPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const pythonBin = await resolvePythonBin(root);
  const dataDir = process.env.DATA_DIR || path.join(app.getPath("userData"), "data");
  const logsDir = path.join(app.getPath("userData"), "logs");
  const logPath = path.join(logsDir, "backend.log");

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(logPath, "");

  const env = {
    ...process.env,
    DATA_DIR: dataDir,
    PYTHONPATH: root,
  };

  backendProcess = spawn(
    pythonBin,
    ["-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", String(port), "--log-level", "info"],
    {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  backendProcess.stdout.on("data", (chunk) => appendLog(logPath, chunk));
  backendProcess.stderr.on("data", (chunk) => appendLog(logPath, chunk));

  backendProcess.on("exit", (code, signal) => {
    backendProcess = null;
    if (mainWindow && code !== 0 && signal !== "SIGTERM") {
      mainWindow.webContents.send("backend-exited", { code, signal, logPath });
    }
  });

  await waitForBackend(baseUrl);
  return { baseUrl, dataDir, logPath };
}

function errorHtml(error) {
  const message = String(error?.message || error);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>CloakBrowser Accounts</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #111315; color: #eceff3; }
    main { max-width: 720px; margin: 12vh auto; padding: 0 28px; }
    h1 { font-size: 24px; margin: 0 0 12px; }
    p { color: #a8b0bc; line-height: 1.6; }
    code { background: #20242a; color: #d8dee8; padding: 2px 5px; border-radius: 4px; }
    pre { background: #20242a; padding: 16px; border-radius: 8px; overflow: auto; color: #d8dee8; }
  </style>
</head>
<body>
  <main>
    <h1>Backend failed to start</h1>
    <p>${message.replace(/</g, "&lt;")}</p>
    <p>For local development, install the backend dependencies from the project root:</p>
    <pre>python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt</pre>
    <p>You can also set <code>PYTHON_BIN</code> if Python lives somewhere custom.</p>
  </main>
</body>
</html>`;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 680,
    title: "CloakBrowser Accounts",
    backgroundColor: "#111315",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  try {
    const backend = await startBackend();
    process.env.CLOAK_API_BASE = backend.baseUrl;
    await mainWindow.loadURL(backend.baseUrl);
  } catch (error) {
    await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml(error))}`);
  }
}

function stopBackend() {
  if (!backendProcess) return;
  const child = backendProcess;
  backendProcess = null;
  child.kill("SIGTERM");
}

app.whenReady().then(createWindow);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", stopBackend);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
