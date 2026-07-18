import { createRequire } from "module";
const requireModule = createRequire(import.meta.url);
const pdf = requireModule("pdf-parse");
console.log(typeof pdf);
