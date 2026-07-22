const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabaseAdmin = require('@/config/supabaseAdmin');
const { requireAuth, requireRole } = require('@/middlewares/auth');
const { logActivity } = require('@/lib/logger');
const storage = require('@/services/storage');
const { isSafePath, safeErrorMessage } = require('@/lib/security');

const ALLOWED_MIMES = [
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/zip', 'application/x-zip-compressed',
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('File type not allowed'));
  },
});

router.use(requireAuth);
router.use(requireRole('admin', 'accountant'));

function validatePath(p) {
  return p && typeof p === 'string' && isSafePath(p) && !p.includes('..');
}

// GET /api/drive — list files in a folder
router.get('/', async (req, res) => {
  try {
    const folder = req.query.folder || '';
    if (folder && !validatePath(folder)) {
      return res.status(400).json({ success: false, message: 'Invalid folder path' });
    }
    const items = await storage.listFiles(folder);

    const folders = items.filter((i) => i.id === null).map((f) => ({
      id: `${folder ? folder + '/' : ''}${f.name}`,
      name: f.name,
      mimeType: 'application/vnd.google-apps.folder',
      createdTime: f.created_at,
    }));

    const files = items.filter((i) => i.id !== null).map((f) => ({
      id: `${folder ? folder + '/' : ''}${f.name}`,
      name: f.name,
      size: f.metadata?.size || 0,
      mimeType: f.metadata?.mimetype || 'application/octet-stream',
      createdTime: f.created_at,
      modifiedTime: f.updated_at,
    }));

    res.json({ success: true, result: { files: [...folders, ...files], currentFolder: folder || null } });
  } catch (err) {
    console.error('Drive list error:', safeErrorMessage(err));
    res.json({ success: true, result: { files: [], currentFolder: null } });
  }
});

// POST /api/drive/folder — create folder
router.post('/folder', async (req, res) => {
  try {
    const { parent, name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Folder name is required' });
    }
    const sanitizedName = name.trim().replace(/[^\w\s.\-]/g, '_').slice(0, 200);
    if (parent && !validatePath(parent)) {
      return res.status(400).json({ success: false, message: 'Invalid parent path' });
    }
    const folderPath = `${parent ? parent + '/' : ''}${sanitizedName}`;
    const markerPath = `${folderPath}/.folderkeep`;
    await storage.uploadFile(markerPath, Buffer.from(''), 'application/octet-stream');

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'create',
      entity: 'drive_folder',
      entityId: folderPath,
      details: { name: sanitizedName, parent: parent || null },
      ipAddress: req.ip,
    });

    res.json({ success: true, result: { id: folderPath, name: sanitizedName } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create folder' });
  }
});

// POST /api/drive/upload — upload file(s)
router.post('/upload', upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files provided' });
    }
    const folder = req.body.folder || '';
    if (folder && !validatePath(folder)) {
      return res.status(400).json({ success: false, message: 'Invalid folder path' });
    }
    const results = [];

    for (const file of req.files) {
      const safeName = file.originalname.replace(/[^\w.\-]/g, '_').slice(0, 200);
      const filePath = folder ? `${folder}/${safeName}` : safeName;
      await storage.uploadFile(filePath, file.buffer, file.mimetype);

      logActivity({
        userId: req.user.id,
        userEmail: req.user.email,
        action: 'upload',
        entity: 'drive_file',
        entityId: filePath,
        details: { name: safeName, size: file.size },
        ipAddress: req.ip,
      });

      results.push({ id: filePath, name: safeName, size: file.size });
    }

    res.json({ success: true, result: results });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to upload files' });
  }
});

// DELETE /api/drive — delete file(s)
router.delete('/', async (req, res) => {
  try {
    const { files } = req.body;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files specified' });
    }
    for (const f of files) {
      if (!validatePath(f)) continue;
      await storage.deleteFile(f);
      logActivity({
        userId: req.user.id,
        userEmail: req.user.email,
        action: 'delete',
        entity: 'drive_file',
        entityId: f,
        details: { path: f },
        ipAddress: req.ip,
      });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete files' });
  }
});

// POST /api/drive/move — move file(s) to a folder
router.post('/move', async (req, res) => {
  try {
    const { files, targetFolder } = req.body;
    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ success: false, message: 'No files specified' });
    }
    if (targetFolder && !validatePath(targetFolder)) {
      return res.status(400).json({ success: false, message: 'Invalid target folder' });
    }
    for (const f of files) {
      if (!validatePath(f)) continue;
      const fileName = f.split('/').pop().replace(/[^\w.\-]/g, '_');
      const toPath = targetFolder ? `${targetFolder}/${fileName}` : fileName;
      await storage.moveFile(f, toPath);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to move files' });
  }
});

// PATCH /api/drive/rename — rename file (move to new path)
router.patch('/rename', async (req, res) => {
  try {
    const { path: filePath, newName } = req.body;
    if (!filePath || !newName) {
      return res.status(400).json({ success: false, message: 'path and newName required' });
    }
    if (!validatePath(filePath)) {
      return res.status(400).json({ success: false, message: 'Invalid file path' });
    }
    const safeName = newName.replace(/[^\w.\-]/g, '_').slice(0, 200);
    const parts = filePath.split('/');
    parts.pop();
    const newPath = [...parts, safeName].filter(Boolean).join('/');
    await storage.moveFile(filePath, newPath);

    logActivity({
      userId: req.user.id,
      userEmail: req.user.email,
      action: 'rename',
      entity: 'drive_file',
      entityId: filePath,
      details: { old: filePath, new: newPath },
      ipAddress: req.ip,
    });

    res.json({ success: true, result: { id: newPath, name: safeName } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to rename file' });
  }
});

// GET /api/drive/download — download file
router.get('/download', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath || !validatePath(filePath)) {
      return res.status(400).json({ success: false, message: 'Valid path required' });
    }
    const signedUrl = await storage.getSignedUrl(filePath, 300);
    res.json({ success: true, result: { url: signedUrl } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get download link' });
  }
});

module.exports = router;
