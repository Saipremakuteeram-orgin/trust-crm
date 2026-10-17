import test from "node:test";
import assert from "node:assert/strict";
import { mergeOcrResults, parseExpenseOcrItems } from "./expenseParser.js";

test("parses INR item lines and a detected total", () => {
  const parsed = parseExpenseOcrItems([
    { text: "Rice bag ₹1,250", score: 0.91, poly: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 30 }, { x: 0, y: 30 }] },
    { text: "Oil Rs 240", score: 0.88, poly: [{ x: 0, y: 40 }, { x: 160, y: 40 }, { x: 160, y: 70 }, { x: 0, y: 70 }] },
    { text: "Total 1,490", score: 0.95, poly: [{ x: 0, y: 80 }, { x: 140, y: 80 }, { x: 140, y: 110 }, { x: 0, y: 110 }] },
  ]);

  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].item_name, "Rice bag");
  assert.equal(parsed.items[0].amount, 1250);
  assert.equal(parsed.detected_total, 1490);
  assert.equal(parsed.calculated_total, 1490);
  assert.equal(parsed.total_mismatch, false);
});

test("keeps Tamil text and flags a total mismatch", () => {
  const parsed = parseExpenseOcrItems([
    { text: "அரிசி 500", score: 0.72, poly: [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 28 }, { x: 0, y: 28 }] },
    { text: "மொத்தம் 700", score: 0.80, poly: [{ x: 0, y: 40 }, { x: 120, y: 40 }, { x: 120, y: 68 }, { x: 0, y: 68 }] },
  ]);

  assert.equal(parsed.items[0].item_name, "அரிசி");
  assert.equal(parsed.items[0].amount, 500);
  assert.equal(parsed.detected_total, 700);
  assert.equal(parsed.total_mismatch, true);
});

test("merges overlapping English and Tamil recognition results by confidence", () => {
  const box = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 25 }, { x: 0, y: 25 }];
  const merged = mergeOcrResults([
    { items: [{ text: "rice 500", score: 0.55, poly: box }] },
    { items: [{ text: "அரிசி 500", score: 0.72, poly: box }] },
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].text, "அரிசி 500");
});
