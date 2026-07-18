import { createRequire } from "module";
const requireModule = typeof require !== "undefined" ? require : createRequire(import.meta.url);
const pdf = requireModule("pdf-parse");
console.log(typeof pdf);
