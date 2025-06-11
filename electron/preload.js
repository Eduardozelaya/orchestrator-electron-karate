const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectMavenProject: () => ipcRenderer.invoke('select-maven-project'),
  getFeatureTests: () => ipcRenderer.invoke('get-feature-tests'),
  runTests: (paths) => ipcRenderer.invoke('run-tests', paths),
  listDataFiles: (path) => ipcRenderer.invoke('list-data-files', path),
  readFileContent: (path) => ipcRenderer.invoke('read-file-content', path),
  openReport: (reportPath) => ipcRenderer.invoke('open-report', reportPath),
  saveCsvFile: (path, content) => ipcRenderer.invoke('save-csv-file', { path, content }),
  uploadFile: (path, content) => ipcRenderer.invoke('upload-file', { path, content }),
  downloadFile: (path) => ipcRenderer.invoke('download-file', path),
  deleteFile: (path) => ipcRenderer.invoke('delete-file', path)
});