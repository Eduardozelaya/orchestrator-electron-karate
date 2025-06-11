const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let projectRoot = '';
let basePath = '';
let currentMavenProcess = null;
let shouldContinueExecution = true;

function setProjectPath(projectPath) {
  if (!fs.existsSync(projectPath)) {
    throw new Error(`Caminho do projeto não existe: ${projectPath}`);
  }

  projectRoot = projectPath;
  const possibleResourcePaths = [
    path.join(projectPath, 'src', 'test', 'resources'),
    projectPath
  ];

  basePath = possibleResourcePaths.find(p => fs.existsSync(p));
  
  if (!basePath) {
    throw new Error(`Diretório de recursos de teste não encontrado em: ${projectPath}`);
  }

  console.log('🔍 Projeto configurado:', projectRoot);
  console.log('🔍 Caminho base para features:', basePath);
  return { projectRoot, basePath };
}

function findDataFiles(scenarioDir) {
    let dataFiles = [];
    let descriptionFiles = [];

    function searchFiles(dir) {
      try {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        files.forEach(file => {
          const fullPath = path.join(dir, file.name);
          if (file.isDirectory()) {
            if (file.name.toLowerCase() === 'data') {
              const dataContents = fs.readdirSync(fullPath)
                .filter(f => /\.(csv|json)$/i.test(f))
                .map(f => path.relative(basePath, path.join(fullPath, f)).replace(/\\/g, '/'));
              dataFiles.push(...dataContents);
            } else if (file.name.toLowerCase() === 'description') {
              const descContents = fs.readdirSync(fullPath)
                .filter(f => /\.(csv|json)$/i.test(f))
                .map(f => path.relative(basePath, path.join(fullPath, f)).replace(/\\/g, '/'));
              descriptionFiles.push(...descContents);
            } else {
              searchFiles(fullPath);
            }
          }
        });
      } catch (error) {
        console.error('❌ Erro ao buscar arquivos:', error);
      }
    }

    searchFiles(scenarioDir);
    return { dataFiles, descriptionFiles };
}

function listFeatureFiles() {
  if (!basePath) {
    throw new Error('Caminho do projeto não configurado. Use setProjectPath primeiro.');
  }

  const results = [];
  const DEFAULT_CATEGORY = 'Testes Disponíveis';

  function isScenarioDirectory(dir) {
    // Verifica se é um diretório de cenário procurando pela estrutura karateTests/UITests
    return fs.existsSync(path.join(dir, 'karateTests', 'UITests'));
  }

  function findFeatureFile(dir) {
    // Primeiro tenta encontrar o arquivo padrão
    const expectedPath = path.join(dir, 'karateTests', 'UITests', 'cotizador.feature');
    if (fs.existsSync(expectedPath)) {
      return expectedPath;
    }

    // Se não encontrar, procura por qualquer .feature recursivamente
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const fullPath = path.join(dir, file.name);
      if (file.isDirectory()) {
        const found = findFeatureFile(fullPath);
        if (found) return found;
      } else if (file.name.endsWith('.feature')) {
        return fullPath;
      }
    }
    return null;
  }

  function processDirectory(dir, currentPath = '') {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      if (!item.isDirectory()) continue;

      const fullPath = path.join(dir, item.name);
      const relativePath = path.join(currentPath, item.name);

      if (isScenarioDirectory(fullPath)) {
        // É um diretório de cenário
        const featureFile = findFeatureFile(fullPath);
        if (featureFile) {
          const relativeFeaturePath = path.relative(basePath, featureFile).replace(/\\/g, '/');
          const pathParts = relativePath.split(path.sep);
          const category = pathParts.length > 1 ? pathParts[0] : DEFAULT_CATEGORY;
          
          const { dataFiles, descriptionFiles } = findDataFiles(fullPath);
          
          results.push({
            feature: relativeFeaturePath,
            scenarioName: item.name,
            category: category,
            dataFiles: dataFiles,
            descriptionFiles: descriptionFiles
          });
        }
      } else {
        // Continua procurando em subdiretórios
        processDirectory(fullPath, relativePath);
      }
    }
  }

  processDirectory(basePath);
  
  // Organiza os resultados por categoria
  const organizedResults = results.reduce((acc, test) => {
    if (!acc[test.category]) {
      acc[test.category] = [];
    }
    acc[test.category].push(test);
    return acc;
  }, {});

  console.log('🧪 Total de cenários encontrados:', results.length);
  return organizedResults;
}

function killCurrentTest() {
  if (currentMavenProcess) {
    try {
      // No Windows, precisamos usar taskkill para garantir que todos os processos filhos sejam mortos
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', currentMavenProcess.pid, '/T', '/F']);
      } else {
        currentMavenProcess.kill('SIGTERM');
      }
      currentMavenProcess = null;
      shouldContinueExecution = false; // Impede que novos testes sejam iniciados
      return true;
    } catch (error) {
      console.error('Erro ao tentar matar o processo Maven:', error);
      return false;
    }
  }
  shouldContinueExecution = false; // Mesmo sem processo atual, impede novos testes
  return true;
}

async function runTests(paths) {
  if (!projectRoot || !basePath) {
    throw new Error('Caminho do projeto não configurado. Use setProjectPath primeiro.');
  }

  // Reseta o flag de controle de execução
  shouldContinueExecution = true;
  
  // Create a map to store results in the same order as paths
  const resultsMap = new Map();
  
  for (const [index, featurePath] of paths.entries()) {
    // Verifica se a execução deve continuar
    if (!shouldContinueExecution) {
      console.log('🛑 Execução interrompida pelo usuário. Parando sequência de testes.');
      
      // Adiciona resultados cancelados para os testes restantes
      for (let i = index; i < paths.length; i++) {
        resultsMap.set(i, {
          success: false,
          feature: paths[i],
          error: 'Execução cancelada pelo usuário',
          originalIndex: i
        });
      }
      break;
    }

    console.log(`🚀 Executando teste ${index + 1}/${paths.length}:`, featurePath);
    
    const command = process.platform === 'win32' ? 'mvn.cmd' : 'mvn';
    const args = ['test', `-Dkarate.options=classpath:${featurePath}`];

    console.log('📋 Comando:', command, args.join(' '));

    const result = await new Promise((resolve) => {
      currentMavenProcess = spawn(command, args, {
        cwd: projectRoot,
        shell: true,
        stdio: ['inherit', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      currentMavenProcess.stdout?.on('data', data => {
        const output = data.toString();
        stdout += output;
        console.log('📤 Maven output:', output);
      });

      currentMavenProcess.stderr?.on('data', data => {
        const output = data.toString();
        stderr += output;
        console.error('📤 Maven error:', output);
      });

      currentMavenProcess.on('close', code => {
        console.log(`✅ Processo finalizado com código: ${code}`);
        currentMavenProcess = null;
        
        // Se a execução foi interrompida, considera como falha
        if (!shouldContinueExecution) {
          resolve({
            success: false,
            feature: featurePath,
            error: 'Execução interrompida pelo usuário',
            originalIndex: index
          });
          return;
        }

        const reportBaseName = featurePath.replace(/\//g, '.').replace(/\.feature$/, '') + '.html';
        const reportPath = path.join('target', 'karate-reports', reportBaseName);
        const absoluteReportPath = path.resolve(projectRoot, reportPath);

        console.log('📄 Caminho do relatório:', absoluteReportPath);

        if (code === 0) {
          resolve({
            success: true,
            feature: featurePath,
            report: `file://${absoluteReportPath}`,
            output: stdout,
            originalIndex: index
          });
        } else {
          resolve({
            success: false,
            feature: featurePath,
            report: `file://${absoluteReportPath}`,
            error: stderr || stdout || 'Erro desconhecido na execução',
            originalIndex: index
          });
        }
      });

      currentMavenProcess.on('error', (error) => {
        console.error('❌ Erro ao executar comando:', error);
        currentMavenProcess = null;
        resolve({
          success: false,
          feature: featurePath,
          error: `Erro ao executar: ${error.message}`,
          originalIndex: index 
        });
      });
    });

    // Store the result with its original index
    resultsMap.set(index, result);
  }

  // Convert map back to array maintaining original order
  const results = Array.from(resultsMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([_, result]) => result);

  return results;
}

module.exports = { setProjectPath, listFeatureFiles, runTests, killCurrentTest };