var app = require('electron').app;
var BrowserWindow = require('electron').BrowserWindow;
var globalShortcut = require('electron').globalShortcut;
var ipcMain = require('electron').ipcMain;
var is = require('electron-is');
var settings = require('electron-settings');

//-- create a global var for all the windows
var appWindows = {
    main: null,
    isWaitingForSpace: false
};

/**
 * quit the app when all windows are closed
 */
app.on('window-all-closed', function() {
    if (is.dev()) app.quit();
});

/**
 * main app init
 */
app.on('ready', function() {
    //-- init the main window
    appWindows.main = new BrowserWindow({
        width: 1000,
        height: 600,
        frame: false
    });

    appWindows.main.on('closed', function() {});

    if (is.dev()) appWindows.main.toggleDevTools();

    appWindows.main.loadURL('file://' + __dirname + '/index.html');

    // register global shortcuts
    var shortString = 'CommandOrControl+Space';
    if (settings.has('shortcut') === true) {
        shortString = settings.get('shortcut');
    }
    globalShortcut.register(shortString, function() {
        if (is.osx()) app.show();
        appWindows.main.focus();
        appWindows.main.setSkipTaskbar(false);
        appWindows.main.webContents.send('tryPluck');
    });
}); //-- end of app ready