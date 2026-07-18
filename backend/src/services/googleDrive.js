const { google } = require('googleapis');
const stream = require('stream');

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
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  driveClient = { auth, folderId };
  return driveClient;
}

function getDriveApi() {
  const drive = getDrive();
  if (!drive) throw new Error('Google Drive not configured');
  return { driveApi: google.drive({ version: 'v3', auth: drive.auth }), drive };
}

async function getOrCreateSubfolder(parentFolderId, folderName) {
  const { driveApi } = getDriveApi();

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

async function getCommonFolderId() {
  const { drive, driveApi } = getDriveApi();
  if (!drive.folderId) throw new Error('GOOGLE_DRIVE_FOLDER_ID not configured');

  const commonId = process.env.GOOGLE_DRIVE_COMMON_FOLDER_ID;
  if (commonId) return commonId;

  return getOrCreateSubfolder(drive.folderId, 'Common');
}

async function listFiles(folderId, pageSize = 100) {
  const { driveApi } = getDriveApi();
  const q = `'${folderId}' in parents and trashed = false`;
  const response = await driveApi.files.list({
    q,
    pageSize,
    fields: 'files(id, name, webViewLink, createdTime, modifiedTime, mimeType, size, parents)',
    orderBy: 'name',
  });

  const files = response.data.files || [];
  const folders = files.filter((f) => f.mimeType === 'application/vnd.google-apps.folder');
  const regularFiles = files.filter((f) => f.mimeType !== 'application/vnd.google-apps.folder');
  return [...folders, ...regularFiles];
}

async function getFileInfo(fileId) {
  const { driveApi } = getDriveApi();
  const response = await driveApi.files.get({
    fileId,
    fields: 'id, name, webViewLink, createdTime, modifiedTime, mimeType, size, parents',
  });
  return response.data;
}

async function createFolder(parentId, name) {
  const { driveApi } = getDriveApi();
  const response = await driveApi.files.create({
    resource: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id, name, mimeType, createdTime',
  });
  return response.data;
}

async function uploadFile(parentId, fileName, mimeType, fileBuffer) {
  const { driveApi } = getDriveApi();
  const response = await driveApi.files.create({
    resource: { name: fileName, parents: [parentId] },
    media: { mimeType, body: stream.Readable.from(fileBuffer) },
    fields: 'id, name, mimeType, size, createdTime',
  });
  return response.data;
}

async function renameFile(fileId, newName) {
  const { driveApi } = getDriveApi();
  const response = await driveApi.files.update({
    fileId,
    resource: { name: newName },
    fields: 'id, name, modifiedTime',
  });
  return response.data;
}

async function moveFile(fileId, newParentId) {
  const { driveApi } = getDriveApi();
  const file = await driveApi.files.get({ fileId, fields: 'parents' });
  const oldParents = file.data.parents ? file.data.parents.join(',') : '';

  const response = await driveApi.files.update({
    fileId,
    addParents: newParentId,
    removeParents: oldParents,
    fields: 'id, name, parents',
  });
  return response.data;
}

async function copyFile(fileId, newParentId, newName) {
  const { driveApi } = getDriveApi();
  const resource = { parents: [newParentId] };
  if (newName) resource.name = newName;

  const response = await driveApi.files.copy({
    fileId,
    resource,
    fields: 'id, name, mimeType, size, createdTime',
  });
  return response.data;
}

async function trashFile(fileId) {
  const { driveApi } = getDriveApi();
  const response = await driveApi.files.update({
    fileId,
    resource: { trashed: true },
    fields: 'id, name, trashed',
  });
  return response.data;
}

async function uploadToDrive({ fileName, mimeType, fileBuffer, role }) {
  const { driveApi, drive } = getDriveApi();
  let targetFolderId = drive.folderId;

  if (drive.folderId && role && (role === 'admin' || role === 'accountant')) {
    targetFolderId = await getOrCreateSubfolder(drive.folderId, role);
  }

  const response = await driveApi.files.create({
    resource: { name: fileName, parents: targetFolderId ? [targetFolderId] : undefined },
    media: { mimeType, body: stream.Readable.from(fileBuffer) },
    fields: 'id, name, webViewLink, createdTime',
  });

  return response.data;
}

async function listDriveStructure() {
  const { drive } = getDriveApi();
  if (!drive.folderId) return { root: [], admin: [], accountant: [], common: [] };

  const rootFiles = await listFiles(drive.folderId);

  let adminFolderId = null;
  let accountantFolderId = null;
  let commonFolderId = null;

  for (const f of rootFiles) {
    if (f.name === 'admin' && f.mimeType === 'application/vnd.google-apps.folder') adminFolderId = f.id;
    if (f.name === 'accountant' && f.mimeType === 'application/vnd.google-apps.folder') accountantFolderId = f.id;
    if (f.name === 'Common' && f.mimeType === 'application/vnd.google-apps.folder') commonFolderId = f.id;
  }

  const adminFiles = adminFolderId ? await listFiles(adminFolderId) : [];
  const accountantFiles = accountantFolderId ? await listFiles(accountantFolderId) : [];
  const commonFiles = commonFolderId ? await listFiles(commonFolderId) : [];

  const root = rootFiles.filter((f) => f.mimeType !== 'application/vnd.google-apps.folder');

  return { root, admin: adminFiles, accountant: accountantFiles, common: commonFiles };
}

module.exports = {
  getDrive,
  getDriveApi,
  getCommonFolderId,
  listFiles,
  getFileInfo,
  createFolder,
  uploadFile,
  renameFile,
  moveFile,
  copyFile,
  trashFile,
  uploadToDrive,
  listDriveStructure,
  getOrCreateSubfolder,
};
