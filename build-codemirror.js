// 构建脚本：将 CodeMirror 6 打包为单个 IIFE 文件
// 输出为全局变量 window.__tianyinCodeMirror，供 content script 直接使用
const esbuild = require('esbuild');
const path = require('path');

esbuild.build({
  entryPoints: ['lib/codemirror-entry.js'],
  bundle: true,
  format: 'iife',
  globalName: '__tianyinCodeMirror',
  outfile: 'lib/codemirror/codemirror-bundle.js',
  external: [],
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  sourcemap: false,
}).then(() => {
  console.log('CodeMirror 6 打包完成 → lib/codemirror/codemirror-bundle.js');
}).catch((err) => {
  console.error('打包失败:', err);
  process.exit(1);
});
