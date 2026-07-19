const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");
const http = require("http");
const serveHandler = require("serve-handler");

const APP_ROOT = path.join(__dirname, "..");

let server;
let serverPort;
let mainWindow;

function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((request, response) => {
      serveHandler(request, response, { public: APP_ROOT });
    });

    server.on("error", reject);

    server.listen(0, "127.0.0.1", () => {
      serverPort = server.address().port;
      resolve();
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    autoHideMenuBar: true,
    backgroundColor: "#0f172a",
    icon: path.join(APP_ROOT, "assets", "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  Menu.setApplicationMenu(null);

  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/index.html`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await startServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (server) {
    server.close();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
