const TAMIL_RANGE = /[\u0B80-\u0BFF]/;
const TOTAL_WORDS = /^(?:grand\s+)?(?:total|subtotal|amount|மொத்தம்|தொகை)(?:\s|$)/i;
const DATE_PATTERNS = [
  /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/,
  /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/,
];

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function polygonBounds(poly = []) {
  const points = Array.isArray(poly) ? poly : [];
  const xs = points.map((point) => Number(point?.x)).filter(Number.isFinite);
  const ys = points.map((point) => Number(point?.y)).filter(Number.isFinite);
  if (!xs.length || !ys.length) return { left: 0, top: 0, right: 0, bottom: 0 };
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

function amountMatches(text) {
  const matches = [];
  const pattern = /(?:₹|rs\.?|inr)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.\d{1,2})?|[0-9]+(?:\.\d{1,2})?)/gi;
  let match;
  while ((match = pattern.exec(text || ''))) {
    const amount = asNumber(match[1]);
    if (amount !== null && amount > 0) {
      matches.push({ amount, index: match.index, length: match[0].length });
    }
  }
  return matches;
}

function normalizeDateText(text) {
  for (const pattern of DATE_PATTERNS) {
    const match = String(text || '').match(pattern);
    if (!match) continue;
    if (match[1].length === 4) {
      return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    }
    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  return null;
}

function cleanItemText(text, amount) {
  if (!text) return '';
  const withoutAmount = text.replace(/(?:₹|rs\.?|inr)?\s*[0-9]{1,3}(?:,[0-9]{2,3})*(?:\.\d{1,2})?|(?:₹|rs\.?|inr)?\s*[0-9]+(?:\.\d{1,2})?/gi, ' ');
  return withoutAmount
    .replace(/^[\s:|\-–—]+|[\s:|\-–—]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || (amount ? 'Unrecognized item' : '');
}

function itemLanguage(text) {
  return TAMIL_RANGE.test(text || '') ? 'ta' : 'en';
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    const topDelta = a.bounds.top - b.bounds.top;
    if (Math.abs(topDelta) > 18) return topDelta;
    return a.bounds.left - b.bounds.left;
  });
}

function normalizeOcrItems(rawItems = []) {
  return sortItems(rawItems
    .filter((item) => item && typeof item.text === 'string' && item.text.trim())
    .map((item, index) => ({
      line_number: index + 1,
      source_text: item.text.trim(),
      text: item.text.trim(),
      confidence: clamp(item.score),
      language: item.language || itemLanguage(item.text),
      poly: Array.isArray(item.poly) ? item.poly : [],
      bounds: polygonBounds(item.poly),
    })));
}

export function parseExpenseOcrItems(rawItems = []) {
  const lines = normalizeOcrItems(rawItems);
  const items = [];
  let detectedTotal = null;
  let detectedDate = null;
  let detectedParty = '';

  for (const line of lines) {
    const text = line.text;
    const date = normalizeDateText(text);
    if (date && !detectedDate) detectedDate = date;

    const amounts = amountMatches(text);
    const isTotal = TOTAL_WORDS.test(text.trim());
    if (isTotal && amounts.length) {
      detectedTotal = amounts[amounts.length - 1].amount;
      continue;
    }

    if (!amounts.length) {
      if (!detectedParty && items.length === 0 && text.length <= 120 && !date) {
        detectedParty = text;
      }
      continue;
    }

    const amountMatch = amounts[amounts.length - 1];
    const itemName = cleanItemText(text, amountMatch.amount);
    const quantityMatch = itemName.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*[x×]\s*$/i);
    const quantity = quantityMatch ? Number(quantityMatch[1]) : 1;

    items.push({
      line_number: items.length + 1,
      item_name: itemName,
      source_text: text,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      amount: amountMatch.amount,
      confidence: line.confidence,
      language: line.language,
      bounding_box: line.poly,
    });
  }

  const itemTotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalMismatch = detectedTotal !== null && Math.abs(detectedTotal - itemTotal) > 0.01;
  const averageConfidence = lines.length
    ? lines.reduce((sum, line) => sum + line.confidence, 0) / lines.length
    : 0;

  return {
    raw_lines: lines,
    items,
    detected_total: detectedTotal,
    calculated_total: Number(itemTotal.toFixed(2)),
    total_mismatch: totalMismatch,
    detected_date: detectedDate,
    detected_party: detectedParty,
    average_confidence: Number(averageConfidence.toFixed(4)),
  };
}

export function mergeOcrResults(results = []) {
  const allItems = [];
  for (const result of results) {
    for (const item of result?.items || []) {
      allItems.push({ ...item, language: item.language || itemLanguage(item.text) });
    }
  }

  const merged = [];
  for (const candidate of sortItems(allItems.map((item) => ({ ...item, bounds: polygonBounds(item.poly) })))) {
    const existingIndex = merged.findIndex((item) => {
      const a = item.bounds;
      const b = candidate.bounds;
      const horizontalOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const verticalOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const minWidth = Math.max(1, Math.min(a.right - a.left, b.right - b.left));
      const minHeight = Math.max(1, Math.min(a.bottom - a.top, b.bottom - b.top));
      return horizontalOverlap / minWidth > 0.35 && verticalOverlap / minHeight > 0.35;
    });

    if (existingIndex === -1) {
      merged.push(candidate);
      continue;
    }

    const existing = merged[existingIndex];
    const candidateIsTamil = candidate.language === 'ta' || TAMIL_RANGE.test(candidate.text || '');
    const existingIsTamil = existing.language === 'ta' || TAMIL_RANGE.test(existing.text || '');
    const candidateWins = candidate.score > existing.score + 0.02
      || (candidateIsTamil && !existingIsTamil && TAMIL_RANGE.test(candidate.text || ''));
    if (candidateWins) merged[existingIndex] = candidate;
  }

  return merged.map(({ bounds, ...item }) => item);
}

export { amountMatches, normalizeDateText, normalizeOcrItems };
