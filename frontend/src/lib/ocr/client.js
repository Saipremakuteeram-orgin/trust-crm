import { mergeOcrResults, parseExpenseOcrItems } from './expenseParser';

const ORT_WASM_PATH = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
const DET_MODEL_URL = '/ocr-models/PP-OCRv5_mobile_det.tar';
const DEFAULT_REC_MODEL_URL = '/ocr-models/ta_PP-OCRv5_mobile_rec.tar';
const REC_MODEL_URL = import.meta.env.VITE_OCR_TAMIL_REC_MODEL_URL || DEFAULT_REC_MODEL_URL;
const MAX_INFERENCE_SIDE = 1600;

let ocrPipeline = null;
let ocrPromise = null;

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

async function loadPipeline(onStatus) {
  if (ocrPipeline) return ocrPipeline;
  if (!ocrPromise) {
    ocrPromise = (async () => {
      onStatus?.('Preparing image analysis…');
      const { PaddleOCR } = await import('@paddleocr/paddleocr-js');
      ocrPipeline = await PaddleOCR.create({
        ...ocrOptions(),
        textDetectionModelName: 'PP-OCRv5_mobile_det',
        textDetectionModelAsset: { url: DET_MODEL_URL },
        textRecognitionModelName: 'ta_PP-OCRv5_mobile_rec',
        textRecognitionModelAsset: { url: REC_MODEL_URL },
      });
      return ocrPipeline;
    })().catch((error) => {
      ocrPromise = null;
      throw error;
    });
  }
  return ocrPromise;
}

async function prepareImageForOcr(file) {
  if (typeof createImageBitmap !== 'function') return file;

  const bitmap = await createImageBitmap(file);
  const longestSide = Math.max(bitmap.width, bitmap.height);
  if (longestSide <= MAX_INFERENCE_SIDE) {
    bitmap.close();
    return file;
  }

  const scale = MAX_INFERENCE_SIDE / longestSide;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  return blob || file;
}

export async function analyzeExpenseImage(file, { onStatus } = {}) {
  if (!file) throw new Error('An image is required');
  const pipeline = await loadPipeline(onStatus);
  const inferenceImage = await prepareImageForOcr(file);
  onStatus?.('Analyzing image…');
  const resultSets = await pipeline.predict(inferenceImage, {
    textDetLimitSideLen: MAX_INFERENCE_SIDE,
    textDetLimitType: 'max',
    textDetMaxSideLimit: MAX_INFERENCE_SIDE,
  });

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
