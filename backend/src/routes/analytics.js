const express = require('express');
const { execFile } = require('child_process');
const path = require('path');

const router = express.Router();

function findPython() {
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;
  if (process.platform === 'win32') return 'python';
  for (const cmd of ['python3', 'python']) {
    try {
      require('child_process').execFileSync('which', [cmd], { stdio: 'ignore' });
      return cmd;
    } catch {}
  }
  return 'python3';
}

const PYTHON = findPython();
const SCRIPT = path.join(__dirname, '..', '..', 'analytics', 'analytics.py');

router.get('/', (req, res) => {
  const env = {
    ...process.env,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  execFile(PYTHON, [SCRIPT], { env, timeout: 30000 }, (error, stdout, stderr) => {
    if (error) {
      console.error('Python analytics error:', stderr || error.message);
      return res.status(500).json({ success: false, message: 'Analytics computation failed' });
    }
    try {
      const result = JSON.parse(stdout);
      res.json({ success: true, result });
    } catch (e) {
      console.error('JSON parse error:', e.message, 'stdout:', stdout);
      res.status(500).json({ success: false, message: 'Invalid analytics output' });
    }
  });
});

module.exports = router;
