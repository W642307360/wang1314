import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as ort from "onnxruntime-node";
import sharp from "sharp";

const root = dirname(fileURLToPath(import.meta.url));
const modelPartsDir = join(root, "models", "silueta.parts");
const assembledModelDir = join(root, "data", "models");
const assembledModelPath = join(assembledModelDir, "silueta.onnx");
const DISPLAY_SIZE = 360;
const MODEL_SIZE = 320;
let sessionPromise;

const ensureModelFile = () => {
  const parts = readdirSync(modelPartsDir)
    .filter((name) => name.endsWith(".part"))
    .sort()
    .map((name) => join(modelPartsDir, name));
  if (!parts.length) throw new Error("白底轮廓模型分片缺失");
  const expectedSize = parts.reduce((total, part) => total + statSync(part).size, 0);
  if (existsSync(assembledModelPath) && statSync(assembledModelPath).size === expectedSize)
    return assembledModelPath;
  mkdirSync(assembledModelDir, { recursive: true });
  const temporaryPath = `${assembledModelPath}.tmp`;
  if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  const output = openSync(temporaryPath, "w");
  try {
    for (const part of parts) writeSync(output, readFileSync(part));
  } finally {
    closeSync(output);
  }
  renameSync(temporaryPath, assembledModelPath);
  return assembledModelPath;
};

const getSession = () => {
  sessionPromise ||= ort.InferenceSession.create(ensureModelFile(), {
    executionProviders: ["cpu"],
    graphOptimizationLevel: "all",
    intraOpNumThreads: Math.max(1, Math.min(2, Number(process.env.SHOWCASE_IMAGE_THREADS || 2))),
  });
  return sessionPromise;
};

const modelInput = async (displayBuffer) => {
  const pixels = await sharp(displayBuffer)
    .resize(MODEL_SIZE, MODEL_SIZE, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer();
  const tensor = new Float32Array(3 * MODEL_SIZE * MODEL_SIZE);
  const mean = [0.485, 0.456, 0.406];
  const deviation = [0.229, 0.224, 0.225];
  const plane = MODEL_SIZE * MODEL_SIZE;
  for (let pixel = 0; pixel < plane; pixel++) {
    tensor[pixel] = (pixels[pixel * 3] / 255 - mean[0]) / deviation[0];
    tensor[plane + pixel] = (pixels[pixel * 3 + 1] / 255 - mean[1]) / deviation[1];
    tensor[plane * 2 + pixel] = (pixels[pixel * 3 + 2] / 255 - mean[2]) / deviation[2];
  }
  return new ort.Tensor("float32", tensor, [1, 3, MODEL_SIZE, MODEL_SIZE]);
};

const subjectMask = async (displayBuffer) => {
  const session = await getSession();
  const output = await session.run({ [session.inputNames[0]]: await modelInput(displayBuffer) });
  const values = output[session.outputNames[0]].data;
  let minimum = Infinity; let maximum = -Infinity;
  for (const value of values) { minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); }
  const scale = Math.max(0.00001, maximum - minimum);
  const mask = Buffer.alloc(values.length);
  for (let index = 0; index < values.length; index++) {
    const normalized = (values[index] - minimum) / scale;
    const feathered = Math.max(0, Math.min(1, (normalized - 0.12) / 0.72));
    mask[index] = Math.round((feathered * feathered * (3 - 2 * feathered)) * 255);
  }
  return sharp(mask, { raw: { width: MODEL_SIZE, height: MODEL_SIZE, channels: 1 } })
    .resize(DISPLAY_SIZE, DISPLAY_SIZE)
    .blur(0.7)
    .png()
    .toBuffer();
};

export const generateShowcaseThumbnail = async (source, target) => {
  const display = await sharp(source)
    .rotate()
    .resize(DISPLAY_SIZE, DISPLAY_SIZE, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      withoutEnlargement: false,
    })
    .removeAlpha()
    .png()
    .toBuffer();
  const foreground = await sharp(display)
    .joinChannel(await subjectMask(display))
    .png()
    .toBuffer();
  await sharp({ create: { width: 420, height: 420, channels: 3, background: "#ffffff" } })
    .composite([{ input: foreground, left: 30, top: 24 }])
    .webp({ quality: 86, alphaQuality: 92, smartSubsample: true })
    .toFile(target);
  return target;
};
