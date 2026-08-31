// backup-dom.js
// DOM references for backup.html only — mirrors the history-dom.js pattern
// used for history.html, since this page's ids don't exist on index.html.

export const els = {
  collectedCount: document.getElementById("collectedCount"),
  exportBtn: document.getElementById("exportBtn"),
  copyCodeBtn: document.getElementById("copyCodeBtn"),
  backupStatus: document.getElementById("backupStatus"),
  backupResultText: document.getElementById("backupResultText"),
  importBtn: document.getElementById("importBtn"),
  importFileInput: document.getElementById("importFileInput"),
  pasteCodeBtn: document.getElementById("pasteCodeBtn"),
  importModeReplace: document.getElementById("importModeReplace"),
};
