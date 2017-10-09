var domToImage = require('dom-to-image');
var fs = require('fs');
var ipcRenderer = require('electron').ipcRenderer;
var clipboard = require('electron').clipboard;
var nativeImage = require('electron').nativeImage;
var dialog = require('electron').dialog;
var settings = require('electron-settings');
var notifier = require('node-notifier');
var shell = require('electron').shell;

(function() {
  'use strict';

  angular.module('app').controller('HomeController', ['$scope', function($scope) {
    var self = this;
    this.defaultContent = 'function helloWorld() {\n\t return "hello world!";\n}';

    this.model = {
      selectedLang: 'javascript',
      selectedTheme: 'tomorrow-night-bright',
      content: settings.has('content') === true ? settings.get('content')
        :  this.defaultContent,
      backColor: '#FFF7D3',
      bodyColor: '#36237C',
      toolbarIconLocation: 'left',
      winWidth: 100,
      signature: '',
      css: '',
      tabSize: settings.has('tabSize') === true ? settings.get('tabSize')
        : 4
    };
    this.saveLocation = settings.has('saveLocation') ? settings.get('saveLocation') : '';
    this.availableLangs = [
      'apl',
      'asciiarmor',
      'asn.1',
      'asterisk',
      'brainfuck',
      'clike',
      'clojure',
      'cmake',
      'cobol',
      'coffeescript',
      'commonlisp',
      'crystal',
      'css',
      'cypher',
      'd',
      'dart',
      'diff',
      'django',
      'dockerfile',
      'dtd',
      'dylan',
      'ebnf',
      'ecl',
      'eiffel',
      'elm',
      'erlang',
      'factor',
      'fcl',
      'forth',
      'fortran',
      'gas',
      'gfm',
      'gherkin',
      'go',
      'groovy',
      'haml',
      'handlebars',
      'haskell',
      'haskell-literate',
      'haxe',
      'htmlembedded',
      'htmlmixed',
      'http',
      'idl',
      'javascript',
      'jinja2',
      'jsx',
      'julia',
      'livescript',
      'lua',
      'markdown',
      'mathematica',
      'mbox',
      'mirc',
      'mlike',
      'modelica',
      'mscgen',
      'mumps',
      'nginx',
      'nsis',
      'ntriples',
      'octave',
      'oz',
      'pascal',
      'pegjs',
      'perl',
      'php',
      'pig',
      'powershell',
      'properties',
      'protobuf',
      'pug',
      'puppet',
      'python',
      'q',
      'r',
      'rpm',
      'rst',
      'ruby',
      'rust',
      'sas',
      'sass',
      'scheme',
      'shell',
      'sieve',
      'slim',
      'smalltalk',
      'smarty',
      'solr',
      'soy',
      'sparql',
      'spreadsheet',
      'sql',
      'stex',
      'stylus',
      'swift',
      'tcl',
      'textile',
      'tiddlywiki',
      'tiki',
      'toml',
      'tornado',
      'troff',
      'ttcn',
      'ttcn-cfg',
      'turtle',
      'twig',
      'vb',
      'vbscript',
      'velocity',
      'verilog',
      'vhdl',
      'vue',
      'webidl',
      'xml',
      'xquery',
      'yacas',
      'yaml',
      'yaml-frontmatter',
      'z80'
    ];
    this.availableThemes = [
      '3024-day',
      '3024-night',
      'abcdef',
      'ambiance-mobile',
      'ambiance',
      'base16-dark',
      'base16-light',
      'bespin',
      'blackboard',
      'cobalt',
      'colorforth',
      'dracula',
      'duotone-dark',
      'duotone-light',
      'eclipse',
      'elegant',
      'erlang-dark',
      'hopscotch',
      'icecoder',
      'isotope',
      'lesser-dark',
      'liquibyte',
      'material',
      'mbo',
      'mdn-like',
      'midnight',
      'monokai',
      'neat',
      'neo',
      'night',
      'panda-syntax',
      'paraiso-dark',
      'paraiso-light',
      'pastel-on-dark',
      'railscasts',
      'rubyblue',
      'seti',
      'solarized',
      'the-matrix',
      'tomorrow-night-bright',
      'tomorrow-night-eighties',
      'ttcn',
      'twilight',
      'vibrant-ink',
      'xq-dark',
      'xq-light',
      'yeti',
      'zenburn'
    ];
    this.toolbarLocation = [
      'left',
      'right'
    ]
    this.cmo = null;
    this.cmCss = null;
    this.themeLink = null;
    this.pluckLink = null;
    this.pluckCss = './css/pluck.css';

    this.loadCodeMirror = function() {
      this.cmo = CodeMirror(document.getElementsByClassName('o-body')[0], {
        lineNumbers: false,
        indentWithTabs: true,
        lineWrapping: true,
        autofocus: true,
        tabSize: this.model.tabSize
      });
      this.updateMode();
      this.updateTheme();
      this.cmo.setValue(this.model.content);
    }

    this.loadCssCodeMirror = function() {
      this.cmCss = CodeMirror(document.getElementById('css-display'), {
        lineNumbers: true,
        mode: 'css',
        theme: 'tomorrow-night-bright',
        lineWrapping: true
      });
      this.cmCss.setValue(this.model.css);
      this.cmCss.setSize(null, '60vh');
      this.cmCss.on('inputRead', function() {
          self.model.css = self.cmCss.getValue();
          $(self.pluckLink).html(self.model.css);
          settings.set('css', self.model.css);
      });
    }

    this.updateMode = function() {
      var cmo = this.cmo;
      var lang = this.model.selectedLang;
      $.getScript('js/codemirror/mode/' + this.model.selectedLang + '/' + this.model.selectedLang + '.js')
      .done(function() {
        cmo.setOption('mode', lang);
      });
    }

    this.updateTheme = function() {
      this.themeLink.href = 'js/codemirror/theme/' + this.model.selectedTheme + '.css';
      this.cmo.setOption('theme', this.model.selectedTheme);
    }

    this.updateContent = function() {
      this.cmo.setValue(this.model.content);
    }

    this.applyWinWidth = function(value) {
      this.model.winWidth = value + '%';
    }

    this.publish = function() {
      settings.set('content', this.model.content);
      var node = document.getElementById('pluck-result');
      domToImage.toPng(node)
      .then(function(dataUrl) {
        var image = nativeImage.createFromDataURL(dataUrl, {
          height: node.scrollHeight,
          width: node.scrollWidth,
          scaleFactor: 4
        });
        image.resize({
          width: node.scrollWidth,
          height: node.scrollHeight,
          quality: 'best'
        });
        clipboard.writeImage(image);
        var saveLocation = self.saveLocation + new Date().toISOString() + '.png';
        fs.writeFile(saveLocation, image.toPng(), function(err, result) {
          if (err) { throw err; }
          notifier.notify({
            title: 'Plukkit',
            message: 'Image successfully saved as ' + saveLocation,
            sound: true,
            wait: true
          }, function(err, response) {

          });
          notifier.on('click', function(notifierObject, options) {
            shell.showItemInFolder(saveLocation);
          });
        });
      });
    }

    this.tryPluck = function() {
      var toPaste = clipboard.readText('selection');
      var indented = autoIndent(toPaste, this.model.tabSize);
      this.model.content = indented;
      this.cmo.setValue(indented);
    }

    this.initialize = function() {
      injectThemeCss();
      this.loadCodeMirror();
      $.get(this.pluckCss, function(data, status) {
        self.model.css = data; // first load the default CSS
        if (settings.has('css')) {
          self.model.css = settings.get('css'); // then add custom CSS
        }
        injectPluckCss();
      });
      ipcRenderer.on('tryPluck', function(event, args) {
        self.tryPluck();
      });
      $scope.$watch(function() {
        return self.model.content;
      }, function(newValue) {
        self.cmo.setValue(newValue);
      });
      $scope.$watch(function() {
        return self.model.tabSize;
      }, function(newValue) {
        self.cmo.setOption('tabSize', newValue);
      })
    }

    function injectThemeCss() {
      self.themeLink = document.createElement('link');
      self.themeLink.rel = 'stylesheet';
      self.themeLink.type = 'text/css';
      $('body').append(self.themeLink);
    }

    function injectPluckCss() {
      self.pluckLink = document.createElement('style');
      $(self.pluckLink).html(self.model.css);
      $('#code-output').append(self.pluckLink);
      self.loadCssCodeMirror();
    }

    this.initialize();
  }]);
})();
