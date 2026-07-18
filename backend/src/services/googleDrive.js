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

async function uploadToDrive({ fileName, mimeType, fileBuffer }) {
  const drive = getDrive();
  if (!drive) throw new Error('Google Drive not configured');

  const driveApi = google.drive({ version: 'v3', auth: drive.auth });

  const fileMetadata = {
    name: fileName,
  };
  if (drive.folderId) {
    fileMetadata.parents = [drive.folderId];
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

async function listDriveFiles(pageSize = 20) {
  const drive = getDrive();
  if (!drive) throw new Error('Google Drive not configured');

  const driveApi = google.drive({ version: 'v3', auth: drive.auth });

  const q = drive.folderId ? `'${drive.folderId}' in parents` : undefined;
  const response = await driveApi.files.list({
    q,
    pageSize,
    fields: 'files(id, name, webViewLink, createdTime, mimeType)',
    orderBy: 'createdTime desc',
  });

  return response.data.files || [];
}

module.exports = { getDrive, uploadToDrive, listDriveFiles };
