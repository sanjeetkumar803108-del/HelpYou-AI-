// test-esbuild.ts
var import_module = require("module");
var import_meta = {};
var requireModule = typeof require !== "undefined" ? require : (0, import_module.createRequire)(import_meta.url);
var pdf = requireModule("pdf-parse");
console.log(typeof pdf);
