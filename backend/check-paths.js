const p = require('puppeteer');
console.log('Expected path:', p.executablePath());
console.log('Actual path: C:\\Users\\Sathya\\.cache\\puppeteer\\chrome\\win64-152.0.7977.42\\chrome-win64\\chrome.exe');
const fs = require('fs');
console.log('Expected exists:', fs.existsSync(p.executablePath()));
