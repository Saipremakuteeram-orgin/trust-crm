const http = require('http');
function get(path, extra) {
  return new Promise((resolve) => {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9',
      'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty',
      ...extra,
    };
    const req = http.get({ host: 'localhost', port: 8888, path, headers }, (res) => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => resolve({ status: res.statusCode, len: b.length, err: b.includes('<title>Error</title>') }));
    });
    req.on('error', e => resolve({ status: 0, err: e.message }));
  });
}
(async () => {
  const noOrigin = await get('/wa/');
  console.log('NO Origin header :', noOrigin.status, 'errPage', noOrigin.err);
  const withOrigin = await get('/wa/', { 'Origin': 'https://trust-crm-b8rn.onrender.com', 'Referer': 'https://trust-crm-b8rn.onrender.com/wa' });
  console.log('WITH Origin(ref our proxy):', withOrigin.status, 'errPage', withOrigin.err);
  process.exit(0);
})();
