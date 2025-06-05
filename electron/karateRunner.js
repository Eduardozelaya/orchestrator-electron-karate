
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Configuração do projeto - ajuste conforme necessário
const projectRoot = 'C:\\Users\\ferib\\bonitaCotizadorTestArtifact';
const basePath = path.resolve(__dirname, '../src/test/resources');

console.log('🔍 Caminho base para features:', basePath);

function listFeatureFiles() {
  const results = [];

  function walk(dir) {
    try {
      fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.name.endsWith('.feature')) {
          // Buscar QUALQUER arquivo .feature, não apenas cotizador.feature
          const relativeFeaturePath = fullPath.split('resources' + path.sep)[1].replace(/\\/g, '/');
          console.log('📝 Feature encontrada:', relativeFeaturePath);

          // Buscar arquivos de dados associados
          const dataFiles = findDataFiles(fullPath);
          
          results.push({
            feature: relativeFeaturePath,
            dataFiles: dataFiles
          });
        }
      });
    } catch (error) {
      console.error('❌ Erro ao ler diretório:', dir, error.message);
    }
  }

  function findDataFiles(featureFilePath) {
    const featureDir = path.dirname(featureFilePath); // .../UITests
    const testsDir = path.dirname(featureDir); // .../karateTests
    const dataDir = path.join(testsDir, 'data'); // .../karateTests/data
    
    let dataFiles = [];

    try {
      if (fs.existsSync(dataDir)) {
        dataFiles = fs.readdirSync(dataDir)
          .filter(file => /\.(csv|json)$/i.test(file))
          .map(file => {
            const fullDataPath = path.join(dataDir, file);
            return path.relative(basePath, fullDataPath).replace(/\\/g, '/');
          });

        if (dataFiles.length > 0) {
          console.log('  📊 Arquivos de dados:', dataFiles);
        }
      } else {
        console.log('  ℹ️  Pasta de dados não existe:', dataDir);
      }
    } catch (error) {
      console.error('  ❌ Erro ao buscar dados:', error.message);
    }

    return dataFiles;
  }

  if (!fs.existsSync(basePath)) {
    console.error('❌ Caminho base não existe:', basePath);
    return [];
  }

  walk(basePath);
  console.log('🧪 Total de features encontradas:', results.length);
  return results;
}

async function runTests(paths) {
  const results = [];

  for (const featurePath of paths) {
    console.log('🚀 Executando teste:', featurePath);
    
    const command = 'mvn';
    const args = ['test', `-Dkarate.options=classpath:${featurePath}`];

    console.log('📋 Comando:', command, args.join(' '));

    const result = await new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd: projectRoot,
        shell: true,
        stdio: ['inherit', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', data => {
        const output = data.toString();
        stdout += output;
        console.log('📤 Maven output:', output);
      });

      child.stderr?.on('data', data => {
        const output = data.toString();
        stderr += output;
        console.error('📤 Maven error:', output);
      });

      child.on('close', code => {
        console.log(`✅ Processo finalizado com código: ${code}`);
        
        // Gerar caminho do relatório
        const reportBaseName = featurePath.replace(/\//g, '.').replace(/\.feature$/, '') + '.html';
        const reportPath = path.join('target', 'karate-reports', reportBaseName);
        const absoluteReportPath = path.resolve(projectRoot, reportPath);

        if (code === 0) {
          resolve({
            success: true,
            feature: featurePath,
            report: `file://${absoluteReportPath}`,
            output: stdout
          });
        } else {
          resolve({
            success: false,
            feature: featurePath,
            error: stderr || stdout || 'Erro desconhecido na execução'
          });
        }
      });

      child.on('error', (error) => {
        console.error('❌ Erro ao executar comando:', error);
        resolve({
          success: false,
          feature: featurePath,
          error: `Erro ao executar: ${error.message}`
        });
      });
    });

    results.push(result);
  }

  return results;
}

module.exports = { listFeatureFiles, runTests };
