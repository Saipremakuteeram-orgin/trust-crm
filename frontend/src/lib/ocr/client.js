import { mergeOcrResults, parseExpenseOcrItems } from './expenseParser';

const ORT_WASM_PATH = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
const TAMIL_MODEL_URL = import.meta.env.VITE_OCR_TAMIL_REC_MODEL_URL || '';

let englishPipeline = null;
let tamilPipeline = null;
let englishPromise = null;
let tamilPromise = null;

function ocrOptions() {
  return {
    worker: true,
    ortOptions: {
      backend: 'wasm',
      wasmPaths: ORT_WASM_PATH,
      numThreads: 1,
      simd: true,
    },
  };
}

async function loadEnglish(onStatus) {
  if (englishPipeline) return englishPipeline;
  if (!englishPromise) {
    englishPromise = (async () => {
      onStatus?.('Loading English OCR model…');
      const { PaddleOCR } = await import('@paddleocr/paddleocr-js');
      englishPipeline = await PaddleOCR.create({
        ...ocrOptions(),
        lang: 'en',
        ocrVersion: 'PP-OCRv5',
      });
      return englishPipeline;
    })().catch((error) => {
      englishPromise = null;
      throw error;
    });
  }
  return englishPromise;
}

async function loadTamil(onStatus) {
  if (!TAMIL_MODEL_URL) return null;
  if (tamilPipeline) return tamilPipeline;
  if (!tamilPromise) {
    tamilPromise = (async () => {
      onStatus?.('Loading Tamil OCR model…');
      const { PaddleOCR } = await import('@paddleocr/paddleocr-js');
      tamilPipeline = await PaddleOCR.create({
        ...ocrOptions(),
        textDetectionModelName: 'PP-OCRv5_mobile_det',
        textRecognitionModelName: 'ta_PP-OCRv5_mobile_rec',
        textRecognitionModelAsset: { url: TAMIL_MODEL_URL },
      });
      return tamilPipeline;
    })().catch((error) => {
      tamilPromise = null;
      throw error;
    });
  }
  return tamilPromise;
}

export async function analyzeExpenseImage(file, { onStatus } = {}) {
  if (!file) throw new Error('An image is required');
  const english = await loadEnglish(onStatus);
  onStatus?.('Reading handwritten lines…');
  const englishResults = await english.predict(file);
  const resultSets = [...englishResults];
  let tamilAvailable = Boolean(TAMIL_MODEL_URL);
  let tamilError = null;

  if (TAMIL_MODEL_URL) {
    try {
      const tamil = await loadTamil(onStatus);
      if (tamil) {
        const tamilResults = await tamil.predict(file);
        resultSets.push(...tamilResults);
      }
    } catch (error) {
      tamilAvailable = false;
      tamilError = error?.message || 'Tamil OCR model could not be loaded';
      console.warn('[expense-ocr] Tamil model unavailable:', tamilError);
    }
  }

  const mergedItems = mergeOcrResults(resultSets);
  const parsed = parseExpenseOcrItems(mergedItems);
  return {
    ...parsed,
    ocr_payload: {
      items: mergedItems,
      metrics: resultSets.map((result) => result.metrics).filter(Boolean),
      tamil_available: tamilAvailable,
      tamil_error: tamilError,
    },
    warning: tamilError || (!TAMIL_MODEL_URL ? 'Tamil model is not configured; review Tamil lines manually.' : null),
  };
}

export async function disposeExpenseOcr() {
  const pipelines = [englishPipeline, tamilPipeline].filter(Boolean);
  englishPipeline = null;
  tamilPipeline = null;
  englishPromise = null;
  tamilPromise = null;
  await Promise.all(pipelines.map(async (pipeline) => {
    try {
      await pipeline.dispose?.();
    } catch {
      // OCR disposal is best-effort during route changes.
    }
  }));
}

export function isTamilModelConfigured() {
  return Boolean(TAMIL_MODEL_URL);
}
