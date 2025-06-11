const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const { setProjectPath, listFeatureFiles, runTests, getBasePath, killCurrentTest } = require('./karateRunner');
const { Console } = require('console');

let projectPath = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadURL('http://localhost:8080');
  win.webContents.openDevTools();

  // Configura os handlers IPC
  ipcMain.handle('select-maven-project', async () => {
    console.log('📨 IPC: select-maven-project chamado');
    try {
      const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
        title: 'Selecione o projeto Maven com testes Karate'
      });

      if (!result.canceled && result.filePaths.length > 0) {
        projectPath = result.filePaths[0];
        const config = setProjectPath(projectPath);
        return { success: true, ...config };
      }
      return { success: false, error: 'Seleção cancelada' };
    } catch (error) {
      console.error('❌ Erro ao configurar projeto:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('get-feature-tests', async () => {
    console.log('📨 IPC: get-feature-tests chamado');
    try {
      if (!projectPath) {
        throw new Error('Projeto não configurado. Selecione um projeto Maven primeiro.');
      }
      
      const results = listFeatureFiles();
      console.log('Results:', results);
      return results;
    } catch (error) {
      console.error('❌ Erro em get-feature-tests:', error);
      throw error;
    }
  });

  ipcMain.handle('run-tests', async (_, selectedPaths) => {
    if (!projectPath) {
      throw new Error('Projeto não configurado. Selecione um projeto Maven primeiro.');
    }
    
    return await runTests(selectedPaths);
  });

  ipcMain.handle('list-data-files', async (_, featurePath) => {
    if (!projectPath) {
      throw new Error('Projeto não configurado. Selecione um projeto Maven primeiro.');
    }    
    try {
      const results = listFeatureFiles();
      const feature = results.find(f => f.feature === featurePath);
      return feature ? feature.dataFiles : [];
    } catch (err) {
      console.error('❌ Erro ao listar arquivos de dados:', err);
      return [];
    }
  });

  ipcMain.handle('save-csv-file', async (_, args) => {
    const { relativePath, path: filePathParam, content } = args;
    const filePath = relativePath || filePathParam;

    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path provided');
    }

    if (!projectPath) {
      throw new Error('Projeto não configurado. Selecione um projeto Maven primeiro.');
    }

    try {
      const basePath = path.join(projectPath, 'src', 'test', 'resources');
      const absolutePath = path.resolve(basePath, filePath);
      const dir = path.dirname(absolutePath);
      console.log('📂 Salvando arquivo em:', absolutePath);
      await fsPromises.mkdir(dir, { recursive: true });
      await fsPromises.writeFile(absolutePath, content, 'utf-8');
      return `✅ Arquivo salvo com sucesso em: ${absolutePath}`;
    } catch (err) {
      console.error('❌ Erro ao salvar CSV:', err);
      throw err;
    }
  });

  ipcMain.handle('read-file-content', async (_, relativePath) => {
    if (!projectPath) {
      throw new Error('Projeto não configurado. Selecione um projeto Maven primeiro.');
    }
  
    if (!relativePath || typeof relativePath !== 'string') {
      throw new Error(`Caminho inválido para leitura de arquivo: ${relativePath}`);
    }
  
    try {
      const basePath = path.join(projectPath, 'src', 'test', 'resources');
      const absolutePath = path.resolve(basePath, relativePath);
      
      console.log('📂 Lendo arquivo em:', absolutePath);
      
      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Arquivo não encontrado: ${absolutePath}`);
      }
  
      return await fsPromises.readFile(absolutePath, 'utf8');
    } catch (err) {
      console.error('❌ Erro ao ler arquivo:', err);
      throw err;
    }
  });

  ipcMain.handle('open-report', async (_, reportPath) => {
    try {
      if (!reportPath || typeof reportPath !== 'string') {
        throw new Error('Caminho de relatório inválido');
      }
  
      const fullPath = path.isAbsolute(reportPath)
        ? reportPath
        : path.join(projectPath, reportPath);
  
      console.log('📖 Abrindo relatório:', fullPath);
      await require('electron').shell.openPath(fullPath);
      return { success: true };
    } catch (err) {
      console.error('❌ Erro ao abrir relatório:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('upload-file', async (_, args) => {
    const { path: filePath, content } = args;

    if (!projectPath) {
      throw new Error('Projeto não configurado. Selecione um projeto Maven primeiro.');
    }

    try {
      const basePath = path.join(projectPath, 'src', 'test', 'resources');
      // Normaliza o caminho para usar separadores corretos do sistema
      const normalizedPath = filePath.split('/').join(path.sep);
      const targetPath = path.resolve(basePath, normalizedPath);
      const dir = path.dirname(targetPath);
      
      console.log('📂 Caminho base:', basePath);
      console.log('📂 Caminho do arquivo:', normalizedPath);
      console.log('📂 Caminho completo:', targetPath);
      console.log('📂 Diretório a criar:', dir);

      // Cria o diretório recursivamente
      await fsPromises.mkdir(dir, { recursive: true });
      
      // Escreve o arquivo
      await fsPromises.writeFile(targetPath, Buffer.from(content));
      console.log('✅ Arquivo salvo com sucesso');
      return { success: true };
    } catch (err) {
      console.error('❌ Erro ao fazer upload do arquivo:', err);
      throw err;
    }
  });

  ipcMain.handle('download-file', async (_, filePath) => {
    if (!projectPath) {
      throw new Error('Projeto não configurado. Selecione um projeto Maven primeiro.');
    }

    try {
      const basePath = path.join(projectPath, 'src', 'test', 'resources');
      const sourcePath = path.resolve(basePath, filePath);
      
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Arquivo não encontrado: ${sourcePath}`);
      }

      const result = await dialog.showSaveDialog(win, {
        defaultPath: path.basename(filePath),
        filters: [
          { name: 'CSV', extensions: ['csv'] },
          { name: 'JSON', extensions: ['json'] },
          { name: 'Todos os Arquivos', extensions: ['*'] }
        ]
      });

      if (!result.canceled && result.filePath) {
        await fsPromises.copyFile(sourcePath, result.filePath);
        return { success: true };
      }
      return { success: false, error: 'Download cancelado' };
    } catch (err) {
      console.error('❌ Erro ao fazer download do arquivo:', err);
      throw err;
    }
  });

  ipcMain.handle('delete-file', async (_, filePath) => {
    if (!projectPath) {
      throw new Error('Projeto não configurado. Selecione um projeto Maven primeiro.');
    }

    try {
      const basePath = path.join(projectPath, 'src', 'test', 'resources');
      const targetPath = path.resolve(basePath, filePath);

      // Verifica se o arquivo existe
      if (!fs.existsSync(targetPath)) {
        throw new Error(`Arquivo não encontrado: ${targetPath}`);
      }

      // Deleta o arquivo
      await fsPromises.unlink(targetPath);
      return { success: true };
    } catch (err) {
      console.error('❌ Erro ao deletar arquivo:', err);
      throw err;
    }
  });

  ipcMain.handle('stop-test-execution', async () => {
    console.log('📨 IPC: stop-test-execution chamado');
    try {
      const killed = killCurrentTest();
      return { success: killed };
    } catch (error) {
      console.error('❌ Erro ao tentar parar execução:', error);
      return { success: false, error: error.message };
    }
  });
}

app.whenReady().then(createWindow);