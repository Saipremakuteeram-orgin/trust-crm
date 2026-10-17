import { mergeOcrResults, parseExpenseOcrItems } from './expenseParser';

const ORT_WASM_PATH = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
const DET_MODEL_URL = '/ocr-models/PP-OCRv5_mobile_det.tar';
const DEFAULT_REC_MODEL_URL = '/ocr-models/ta_PP-OCRv5_mobile_rec.tar';
const REC_MODEL_URL = import.meta.env.VITE_OCR_TAMIL_REC_MODEL_URL || DEFAULT_REC_MODEL_URL;
const MAX_INFERENCE_SIDE = 1600;
const OCR_TIMING_KEY = 'trust-crm:ocr-timing:v1';
const DEFAULT_TIMINGS = { modelMs: 18000, imageMs: 700, inferenceMs: 7000 };

let ocrPipeline = null;
let ocrPromise = null;
const pipelineListeners = new Set();

function clock() {
  return globalThis.performance?.now?.() || Date.now();
}

function readTimings() {
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(OCR_TIMING_KEY) || '{}');
    return {
      modelMs: Number.isFinite(stored.modelMs) ? stored.modelMs : DEFAULT_TIMINGS.modelMs,
      imageMs: Number.isFinite(stored.imageMs) ? stored.imageMs : DEFAULT_TIMINGS.imageMs,
      inferenceMs: Number.isFinite(stored.inferenceMs) ? stored.inferenceMs : DEFAULT_TIMINGS.inferenceMs,
    };
  } catch {
    return { ...DEFAULT_TIMINGS };
  }
}

function recordTiming(key, duration) {
  if (!Number.isFinite(duration) || duration <= 0) return;
  const timings = readTimings();
  timings[key] = Math.round(timings[key] * 0.65 + duration * 0.35);
  try {
    globalThis.localStorage?.setItem(OCR_TIMING_KEY, JSON.stringify(timings));
  } catch {
    // Storage may be unavailable in private browsing; OCR still works.
  }
}

function emitPipelineProgress(update) {
  pipelineListeners.forEach((listener) => listener(update));
}

export function isExpenseOcrReady() {
  return Boolean(ocrPipeline);
}

export function getExpenseOcrEstimateSeconds({ fileSize = 0 } = {}) {
  const timings = readTimings();
  const fileFactor = fileSize > 5 * 1024 * 1024 ? 1.15 : 1;
  const totalMs = (ocrPipeline ? 0 : timings.modelMs) + (timings.imageMs + timings.inferenceMs) * fileFactor;
  return Math.max(3, Math.ceil(totalMs / 1000));
}

function ocrOptions() {
  return {
    worker: true,
    ortOptions: {
      backend: 'wasm',
      wasmPaths: ORT_WASM_PATH,
      numThreads: 2,
      simd: true,
    },
    textDetectionBatchSize: 1,
    textRecognitionBatchSize: 6,
  };
}

async function loadPipeline(onStatus, onProgress) {
  const listener = onProgress ? (update) => onProgress(update) : null;
  if (listener) pipelineListeners.add(listener);

  if (ocrPipeline) {
    emitPipelineProgress({ phase: 'model', progress: 1, label: 'OCR engine ready' });
    if (listener) pipelineListeners.delete(listener);
    return ocrPipeline;
  }

  if (!ocrPromise) {
    ocrPromise = (async () => {
      const startedAt = clock();
      emitPipelineProgress({ phase: 'model', progress: 0, label: 'Preparing OCR engine…' });
      onStatus?.('Preparing image analysis…');
      const { PaddleOCR } = await import('@paddleocr/paddleocr-js');
      ocrPipeline = await PaddleOCR.create({
        ...ocrOptions(),
        textDetectionModelName: 'PP-OCRv5_mobile_det',
        textDetectionModelAsset: { url: DET_MODEL_URL },
        textRecognitionModelName: 'ta_PP-OCRv5_mobile_rec',
        textRecognitionModelAsset: { url: REC_MODEL_URL },
      });
      recordTiming('modelMs', clock() - startedAt);
      emitPipelineProgress({ phase: 'model', progress: 1, label: 'OCR engine ready' });
      return ocrPipeline;
    })().catch((error) => {
      ocrPromise = null;
      throw error;
    });
  }

  try {
    return await ocrPromise;
  } finally {
    if (listener) pipelineListeners.delete(listener);
  }
}

async function prepareImageForOcr(file, onProgress) {
  const startedAt = clock();
  onProgress?.({ phase: 'image', progress: 0, label: 'Optimizing image…' });
  if (typeof createImageBitmap !== 'function') {
    onProgress?.({ phase: 'image', progress: 1, label: 'Image ready' });
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const longestSide = Math.max(bitmap.width, bitmap.height);
  if (longestSide <= MAX_INFERENCE_SIDE) {
    bitmap.close();
    recordTiming('imageMs', clock() - startedAt);
    onProgress?.({ phase: 'image', progress: 1, label: 'Image ready' });
    return file;
  }

  const scale = MAX_INFERENCE_SIDE / longestSide;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    bitmap.close();
    recordTiming('imageMs', clock() - startedAt);
    onProgress?.({ phase: 'image', progress: 1, label: 'Image ready' });
    return file;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  recordTiming('imageMs', clock() - startedAt);
  onProgress?.({ phase: 'image', progress: 1, label: 'Image ready' });
  return blob || file;
}

export async function analyzeExpenseImage(file, { onStatus, onProgress } = {}) {
  if (!file) throw new Error('An image is required');
  const pipeline = await loadPipeline(onStatus, onProgress);
  const inferenceImage = await prepareImageForOcr(file, onProgress);
  onStatus?.('Analyzing image…');
  onProgress?.({ phase: 'inference', progress: 0, label: 'Reading text…' });
  const startedAt = clock();
  const resultSets = await pipeline.predict(inferenceImage, {
    textDetLimitSideLen: MAX_INFERENCE_SIDE,
    textDetLimitType: 'max',
    textDetMaxSideLimit: MAX_INFERENCE_SIDE,
  });
  recordTiming('inferenceMs', clock() - startedAt);
  onProgress?.({ phase: 'inference', progress: 1, label: 'Text extraction complete' });

  const mergedItems = mergeOcrResults(resultSets);
  const parsed = parseExpenseOcrItems(mergedItems);
  return {
    ...parsed,
    ocr_payload: {
      items: mergedItems,
      metrics: resultSets.map((result) => result.metrics).filter(Boolean),
      tamil_available: true,
    },
  };
}

export async function prewarmExpenseOcr() {
  await loadPipeline();
}

export async function disposeExpenseOcr() {
  const pipeline = ocrPipeline;
  ocrPipeline = null;
  ocrPromise = null;
  if (!pipeline) return;
  try {
    await pipeline.dispose?.();
  } catch {
    // OCR disposal is best-effort during route changes.
  }
}

export function isTamilModelConfigured() {
  return Boolean(REC_MODEL_URL);
}
