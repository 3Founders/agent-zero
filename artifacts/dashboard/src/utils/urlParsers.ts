// Extracts the spreadsheet ID from a Google Sheets URL
// https://docs.google.com/spreadsheets/d/{ID}/edit → ID
// Returns null if pattern not found
export function extractSheetId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// Extracts the folder ID from a Google Drive folder URL
// https://drive.google.com/drive/folders/{ID}
// https://drive.google.com/drive/u/0/folders/{ID}
// Returns null if pattern not found
export function extractDriveFolderId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/\/folders\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}
