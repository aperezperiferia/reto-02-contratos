import { initOutDirectory } from "../src/init-out.js";

await initOutDirectory(process.cwd());
console.log("out/ reiniciado (maestro copiado desde fixtures, buzón sin procesar).");
