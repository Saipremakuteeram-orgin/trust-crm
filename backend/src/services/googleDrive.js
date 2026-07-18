const { google } = require('googleapis');

let driveClient = null;

function getDrive() {
  if (driveClient) return driveClient;

  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!clientEmail || !privateKey) {
    return null;
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  driveClient = { auth, folderId };
  return driveClient;
}

async function getOrCreateSubfolder(parentFolderId, folderName) {
  const drive = getDrive();
  if (!drive) throw new Error('Google Drive not configured');

  const driveApi = google.drive({ version: 'v3', auth: drive.auth });

  const query = `'${parentFolderId}' in parents and name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const existing = await driveApi.files.list({
    q: query,
    fields: 'files(id, name)',
    pageSize: 1,
  });

  if (existing.data.files && existing.data.files.length > 0) {
    return existing.data.files[0].id;
  }

  const response = await driveApi.files.create({
    resource: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    },
    fields: 'id, name',
  });

  return response.data.id;
}

async function uploadToDrive({ fileName, mimeType, fileBuffer, role }) {
  const drive = getDrive();
  if (!drive) throw new Error('Google Drive not configured');

  const driveApi = google.drive({ version: 'v3', auth: drive.auth });

  let targetFolderId = drive.folderId;

  if (drive.folderId && role && (role === 'admin' || role === 'accountant')) {
    targetFolderId = await getOrCreateSubfolder(drive.folderId, role);
  }

  const fileMetadata = {
    name: fileName,
  };
  if (targetFolderId) {
    fileMetadata.parents = [targetFolderId];
  }

  const media = {
    mimeType,
    body: require('stream').Readable.from(fileBuffer),
  };

  const response = await driveApi.files.create({
    resource: fileMetadata,
    media,
    fields: 'id, name, webViewLink, createdTime',
  });

  return response.data;
}

async function listDriveFiles(folderId, pageSize = 50) {
  const drive = getDrive();
  if (!drive) throw new Error('Google Drive not configured');

  const driveApi = google.drive({ version: 'v3', auth: drive.auth });

  const targetFolder = folderId || drive.folderId;
  const q = targetFolder ? `'${targetFolder}' in parents and trashed = false` : undefined;
  const response = await driveApi.files.list({
    q,
    pageSize,
    fields: 'files(id, name, webViewLink, createdTime, mimeType)',
    orderBy: 'createdTime desc',
  });

  return response.data.files || [];
}

async function listDriveStructure() {
  const drive = getDrive();
  if (!drive) throw new Error('Google Drive not configured');

  if (!drive.folderId) return { root: [], admin: [], accountant: [] };

  const rootFiles = await listDriveFiles(drive.folderId);

  let adminFolderId = null;
  let accountantFolderId = null;

  for (const f of rootFiles) {
    if (f.name === 'admin' && f.mimeType === 'application/vnd.google-apps.folder') adminFolderId = f.id;
    if (f.name === 'accountant' && f.mimeType === 'application/vnd.google-apps.folder') accountantFolderId = f.id;
  }

  const adminFiles = adminFolderId ? await listDriveFiles(adminFolderId) : [];
  const accountantFiles = accountantFolderId ? await listDriveFiles(accountantFolderId) : [];

  const root = rootFiles.filter((f) => f.mimeType !== 'application/vnd.google-apps.folder');

  return { root, admin: adminFiles, accountant: accountantFiles };
}

module.exports = { getDrive, uploadToDrive, listDriveFiles, listDriveStructure, getOrCreateSubfolder };
