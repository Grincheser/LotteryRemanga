const { app, BrowserWindow, session } = require('electron');

// 1. Отключаем безопасность Chromium на уровне движка ДО запуска приложения
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('disable-site-isolation-trials');

function createWindow () {
 const win = new BrowserWindow({
    width: 950,
    height: 600,
    resizable: true,
    autoHideMenuBar: true,
    webPreferences: {
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  });

  // Задаем User-Agent обычного Chrome
  win.webContents.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  // 2. Входящие запросы: притворяемся, что мы на самом сайте Remanga
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['Referer'] = 'https://remanga.org/';
    details.requestHeaders['Origin'] = 'https://remanga.org';
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  // 3. Ответы от сервера: насильно разрешаем доступ для всех (CORS Bypass)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    responseHeaders['access-control-allow-origin'] = ['*'];
    responseHeaders['access-control-allow-headers'] = ['*'];
    responseHeaders['access-control-allow-methods'] = ['GET, POST, OPTIONS'];
    callback({ responseHeaders });
  });

  win.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});