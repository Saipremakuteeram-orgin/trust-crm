const https = require('https');
function get(path, extra) {
  return new Promise((resolve) => {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': '*/*', 'Accept-Language': 'en-US,en;q=0.9',
      'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty',
      ...extra,
    };
    const req = https.get({ host: 'trust-crm-b8rn.onrender.com', path, headers }, (res) => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => resolve({ path, status: res.statusCode, len: b.length, err: b.includes('<title>Error</title>') }));
    });
    req.on('error', e => resolve({ path, status: 0, err: e.message }));
  });
}
(async () => {
  console.log(JSON.stringify(await get('/wa')));
  console.log(JSON.stringify(await get('/wa', { 'Origin': 'https://trust-crm-b8rn.onrender.com', 'Referer': 'https://trust-crm-b8rn.onrender.com/wa' })));
  console.log(JSON.stringify(await get('/wa/', { 'Origin': 'https://trust-crm-b8rn.onrender.com', 'Referer': 'https://trust-crm-b8rn.onrender.com/wa' })));
  process.exit(0);
})();
