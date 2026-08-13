const p = require('puppeteer');
console.log('Chromium path:', p.executablePath());
try {
  require('fs').accessSync(p.executablePath());
  console.log('Chromium exists');
} catch(e) {
  console.log('Chromium NOT found:', e.message);
}
