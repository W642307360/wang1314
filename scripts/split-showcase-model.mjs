import { closeSync, mkdirSync, openSync, readSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const source = resolve(process.argv[2] || "server/models/silueta.onnx");
const outputDirectory = resolve(process.argv[3] || "server/models/silueta.parts");
const chunkSize = Math.max(1024 * 1024, Number(process.argv[4] || 6 * 1024 * 1024));
mkdirSync(outputDirectory, { recursive: true });
const input = openSync(source, "r");
const buffer = Buffer.alloc(chunkSize);
let index = 1;
try {
  while (true) {
    const length = readSync(input, buffer, 0, buffer.length, null);
    if (!length) break;
    const name = `${basename(source)}.${String(index).padStart(2, "0")}.part`;
    writeFileSync(join(outputDirectory, name), buffer.subarray(0, length));
    index++;
  }
} finally {
  closeSync(input);
}
console.log(`已生成 ${index - 1} 个模型分片`);
