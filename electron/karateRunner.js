const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { generateRichReport } = require('./reportGenerator');

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
    path.join(projectPath, 'src', 'test', 'java'),
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
    // Tenta encontrar arquivos padrão conhecidos
    const peopleSoftPath = path.join(dir, 'karateTests', 'UITests', 'peopleSoft.feature');
    if (fs.existsSync(peopleSoftPath)) {
      return peopleSoftPath;
    }

    const cotizadorPath = path.join(dir, 'karateTests', 'UITests', 'cotizador.feature');
    if (fs.existsSync(cotizadorPath)) {
      return cotizadorPath;
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

  // Diretórios a ignorar durante a varredura
  const IGNORED_DIRS = new Set(['target', 'node_modules', '.git', '.idea', '.vscode']);

  function processDirectory(dir, currentPath = '') {
    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      if (!item.isDirectory()) continue;
      if (IGNORED_DIRS.has(item.name)) continue;

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

const GENERATED_RUNNER_PACKAGE = 'orchestratorGenerated';
const GENERATED_RUNNER_CLASS = 'OrchestratorRunnerTest';

/**
 * Encontra a classe runner Java associada a um arquivo .feature.
 * Primeiro procura por arquivos .java no mesmo diretório do feature,
 * depois procura em todo o src/test/java por runners que referenciem o feature.
 * Retorna o nome completo qualificado (ex: Faturamento.criacaoNF.karateTests.UITests.PeopleSoftRunner)
 */
function findRunnerClass(featurePath) {
  // 1. Procura .java no mesmo diretório do feature
  try {
    const featureAbsDir = path.dirname(path.join(basePath, featurePath));
    const files = fs.readdirSync(featureAbsDir);
    const javaFile = files.find(f => f.endsWith('.java'));
    if (javaFile) {
      const featureDirRelative = path.dirname(featurePath);
      const className = javaFile.replace('.java', '');
      return featureDirRelative.replace(/\//g, '.') + '.' + className;
    }
  } catch (err) {
    // diretório não existe ou erro de leitura — segue para próxima estratégia
  }

  return null;
}

/**
 * Gera um runner Java temporário que executa o feature especificado.
 * Isso permite executar qualquer .feature sem depender de runners pré-existentes.
 * Retorna o nome qualificado da classe gerada.
 */
function ensureRunnerForFeature(featurePath) {
  // Verifica se já existe um runner associado
  const existing = findRunnerClass(featurePath);
  if (existing) return existing;

  // Gera um runner temporário em src/test/java
  const javaDir = path.join(projectRoot, 'src', 'test', 'java', GENERATED_RUNNER_PACKAGE);
  const javaFile = path.join(javaDir, `${GENERATED_RUNNER_CLASS}.java`);

  const javaContent = `package ${GENERATED_RUNNER_PACKAGE};

import com.intuit.karate.junit5.Karate;

public class ${GENERATED_RUNNER_CLASS} {
    @Karate.Test
    Karate testFeature() {
        return Karate.run("classpath:${featurePath}");
    }
}
`;

  fs.mkdirSync(javaDir, { recursive: true });
  fs.writeFileSync(javaFile, javaContent, 'utf-8');
  console.log(`🔧 Runner gerado: ${javaFile}`);

  return `${GENERATED_RUNNER_PACKAGE}.${GENERATED_RUNNER_CLASS}`;
}

/**
 * Remove o runner temporário gerado pelo orchestrador.
 */
function cleanupGeneratedRunner() {
  try {
    const javaDir = path.join(projectRoot, 'src', 'test', 'java', GENERATED_RUNNER_PACKAGE);
    if (fs.existsSync(javaDir)) {
      fs.rmSync(javaDir, { recursive: true, force: true });
      console.log('🧹 Runner temporário removido.');
    }
  } catch (err) {
    console.warn('⚠️ Não foi possível remover runner temporário:', err.message);
  }
}

// Regex para parsear marcadores de progresso do Karate stdout
const ROW_TOTAL_RE = /@@ROW_TOTAL:(\d+)/;
const ROW_START_RE = /@@ROW_START:(\d+):(.*)/;
const ROW_END_RE   = /@@ROW_END:(\d+):(PASSED|FAILED)/;
const ROW_END_MSG_RE = /@@ROW_END_MSG:(\d+):(.*)/;
const ROW_FAIL_REASON_RE = /@@ROW_FAIL_REASON:(\d+):(.*)/;
const STEP_RE      = /@@STEP:(\d+):(.*)/;
const SCREENSHOT_RE = /@@SCREENSHOT:(\d+):(.*)/;
const SCREENSHOT_FAIL_RE = /@@SCREENSHOT_FAIL:(\d+):(.*)/;
const ROW_DATA_RE   = /@@ROW_DATA:(\d+):(.*)/;
const RETRY_RE      = /@@RETRY:(\d+):(.*)/;
const RETRY_OK_RE   = /@@RETRY_OK:(\d+):(.*)/;
const RETRY_FAIL_RE = /@@RETRY_FAIL:(\d+):(.*)/;

/**
 * Parseia uma linha de stdout e retorna um evento de progresso, ou null.
 */
function parseProgressLine(line) {
  let match;
  if ((match = ROW_TOTAL_RE.exec(line))) {
    return { type: 'ROW_TOTAL', totalRows: parseInt(match[1]) };
  }
  if ((match = ROW_START_RE.exec(line))) {
    return { type: 'ROW_START', rowIndex: parseInt(match[1]), label: match[2].trim() };
  }
  if ((match = ROW_END_MSG_RE.exec(line))) {
    return { type: 'ROW_END_MSG', rowIndex: parseInt(match[1]), message: match[2].trim() };
  }
  if ((match = ROW_FAIL_REASON_RE.exec(line))) {
    return { type: 'ROW_FAIL_REASON', rowIndex: parseInt(match[1]), error: match[2].trim() };
  }
  if ((match = ROW_END_RE.exec(line))) {
    return { type: 'ROW_END', rowIndex: parseInt(match[1]), status: match[2] };
  }
  if ((match = STEP_RE.exec(line))) {
    return { type: 'STEP', rowIndex: parseInt(match[1]), step: match[2].trim() };
  }
  if ((match = SCREENSHOT_FAIL_RE.exec(line))) {
    return { type: 'SCREENSHOT_FAIL', rowIndex: parseInt(match[1]), error: match[2].trim() };
  }
  if ((match = SCREENSHOT_RE.exec(line))) {
    return { type: 'SCREENSHOT', rowIndex: parseInt(match[1]), name: match[2].trim() };
  }
  if ((match = ROW_DATA_RE.exec(line))) {
    try {
      return { type: 'ROW_DATA', rowIndex: parseInt(match[1]), csvData: JSON.parse(match[2].trim()) };
    } catch (e) {
      return null;
    }
  }
  // Eventos de retry (acaoComRetry)
  if ((match = RETRY_OK_RE.exec(line))) {
    return { type: 'RETRY_OK', rowIndex: parseInt(match[1]), message: match[2].trim() };
  }
  if ((match = RETRY_FAIL_RE.exec(line))) {
    return { type: 'RETRY_FAIL', rowIndex: parseInt(match[1]), message: match[2].trim() };
  }
  if ((match = RETRY_RE.exec(line))) {
    return { type: 'RETRY', rowIndex: parseInt(match[1]), message: match[2].trim() };
  }
  return null;
}

async function runTests(paths, username, password, onProgress) {
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
    
    // Limpar relatórios e screenshots anteriores para garantir que o relatório rico 
    // contenha apenas dados desta execução específica.
    const karateReportsDir = path.join(projectRoot, 'target', 'karate-reports');
    if (fs.existsSync(karateReportsDir)) {
      try {
        // Remove todos os arquivos dentro do diretório, mas mantém a pasta se possível
        const files = fs.readdirSync(karateReportsDir);
        for (const file of files) {
          fs.rmSync(path.join(karateReportsDir, file), { recursive: true, force: true });
        }
        console.log('🧹 Relatórios e screenshots antigos limpos.');
      } catch (err) {
        console.warn('⚠️ Não foi possível limpar relatórios antigos:', err.message);
      }
    }
    
    const command = process.platform === 'win32' ? 'mvn.cmd' : 'mvn';
    const runnerClass = ensureRunnerForFeature(featurePath);
    const args = [
      'test',
      `-Dtest=${runnerClass}`,
      `-Dusername=${username}`,
      `-Dpassword=${password}`
    ];

    console.log(`🎯 Runner: ${runnerClass}`);
    console.log('📋 Comando:', command, args.join(' '));

    const result = await new Promise((resolve) => {
      currentMavenProcess = spawn(command, args, {
        cwd: projectRoot,
        shell: true,
        stdio: ['inherit', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let stdoutBuffer = '';
      const collectedRowEvents = [];

      currentMavenProcess.stdout?.on('data', data => {
        const output = data.toString();
        stdout += output;
        console.log('📤 Maven output:', output);

        // Parseia marcadores de progresso linha por linha (lida com chunks parciais)
        stdoutBuffer += output;
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || ''; // última linha pode estar incompleta
        for (const line of lines) {
          const event = parseProgressLine(line);
          if (event) {
            event.featurePath = featurePath;
            collectedRowEvents.push(event);
            if (onProgress) onProgress(event);
          }
        }
      });

      currentMavenProcess.stderr?.on('data', data => {
        const output = data.toString();
        stderr += output;
        console.error('📤 Maven error:', output);
      });

      currentMavenProcess.on('close', async code => {
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
        const defaultReportPath = path.join('target', 'karate-reports', reportBaseName);
        let finalReportAbsPath = path.resolve(projectRoot, defaultReportPath);
        
        try {
            console.log('🔄 Gerando relatório rich...');
            const richReportPath = await generateRichReport(projectRoot, collectedRowEvents);
            if (richReportPath) {
                finalReportAbsPath = richReportPath;
            }
        } catch (err) {
            console.error('❌ Fallback para relatorio padrão:', err);
        }

        console.log('📄 Caminho do relatório:', finalReportAbsPath);

        if (code === 0) {
          resolve({
            success: true,
            feature: featurePath,
            report: `file://${finalReportAbsPath}`,
            output: stdout,
            originalIndex: index
          });
        } else {
          resolve({
            success: false,
            feature: featurePath,
            report: `file://${finalReportAbsPath}`,
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

  // Limpa runner temporário após todas as execuções
  cleanupGeneratedRunner();

  // Convert map back to array maintaining original order
  const results = Array.from(resultsMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([_, result]) => result);

  return results;
}

function getBasePath() {
  return basePath;
}

module.exports = { setProjectPath, listFeatureFiles, runTests, killCurrentTest, getBasePath };