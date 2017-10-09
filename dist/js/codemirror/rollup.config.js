import buble from 'rollup-plugin-buble';

export default {
  banner: "// CodeMirror, copyright (c) by Marijn Haverbeke and others\n// Distributed under an MIT license: http://codemirror.net/LICENSE\n\n// This is CodeMirror (http://codemirror.net), a code editor\n// implemented in JavaScript on top of the browser's DOM.\n//\n// You can find some technical background for some of the code below\n// at http://marijnhaverbeke.nl/blog/#cm-internals .\n",
  entry: "src/codemirror.js",
  format: "umd",
  dest: "lib/codemirror.js",
  moduleName: "CodeMirror",
  plugins: [ buble({namedFunctionExpressions: false}) ]
};
