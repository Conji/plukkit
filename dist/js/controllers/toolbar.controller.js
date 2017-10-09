(function() {
    var remote = require('electron').remote;
    var window = remote.getCurrentWindow();

    angular.module('app')
        .controller('ToolbarController', [function() {
            this.close = function() {
                window.minimize();
                window.setSkipTaskbar(true);
            }

            this.minimize = function() {
                window.minimize();
            }

            this.maximize = function() {
              if (!window.isMaximized()) { window.maximize(); }
              else { window.unmaximize(); }
            }
        }]);
})();
