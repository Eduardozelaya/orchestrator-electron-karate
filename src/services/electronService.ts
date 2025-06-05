
// Tipagem para o electronAPI
declare global {
  interface Window {
    electronAPI?: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
    };
  }
}

interface KarateFeatureTest {
  feature: string;
  dataFiles: string[];
}

interface TestExecutionResult {
  success: boolean;
  feature: string;
  report?: string;
  output?: string;
  error?: string;
}

export class ElectronService {
  private isElectronAvailable(): boolean {
    // Verificação mais robusta para detectar Electron
    if (typeof window === 'undefined') return false;
    
    return !!(
      window.electronAPI || 
      window.require || 
      window.process?.type === 'renderer' ||
      navigator.userAgent.toLowerCase().includes('electron')
    );
  }

  async getFeatureTests(): Promise<KarateFeatureTest[]> {
    if (!this.isElectronAvailable()) {
      console.warn('⚠️ Electron API não disponível - retornando dados simulados');
      // Retornar dados simulados para desenvolvimento web
      return this.getMockFeatureTests();
    }
    
    try {
      const results = await window.electronAPI!.invoke('get-feature-tests');
      console.log('📊 Features descobertas via Electron:', results);
      return results || [];
    } catch (error) {
      console.error('❌ Erro ao obter testes via Electron:', error);
      console.log('🔄 Fallback para dados simulados');
      return this.getMockFeatureTests();
    }
  }

  private getMockFeatureTests(): KarateFeatureTest[] {
    return [
      {
        feature: 'clienteExistente/cotacaoCnpjInvalido/karateTests/UITests/cotizador.feature',
        dataFiles: ['clienteExistente/cotacaoCnpjInvalido/karateTests/data/dados.csv']
      },
      {
        feature: 'clientePotencial/novoCliente/karateTests/UITests/cadastro.feature',
        dataFiles: ['clientePotencial/novoCliente/karateTests/data/clientes.csv']
      }
    ];
  }

  async runTests(selectedPaths: string[]): Promise<TestExecutionResult[]> {
    if (!this.isElectronAvailable()) {
      console.warn('⚠️ Electron não disponível - executando simulação');
      return this.simulateTestExecution(selectedPaths);
    }

    try {
      const results = await window.electronAPI!.invoke('run-tests', selectedPaths);
      console.log('🚀 Resultados da execução real:', results);
      return results;
    } catch (error) {
      console.error('❌ Erro ao executar testes via Electron:', error);
      throw error;
    }
  }

  private async simulateTestExecution(selectedPaths: string[]): Promise<TestExecutionResult[]> {
    // Simulação para desenvolvimento web
    return selectedPaths.map(path => ({
      success: Math.random() > 0.3,
      feature: path,
      report: '#',
      output: 'Execução simulada - dados de exemplo'
    }));
  }

  async listDataFiles(featurePath: string): Promise<string[]> {
    if (!this.isElectronAvailable()) {
      // Retornar dados simulados baseados no path
      if (featurePath.includes('clienteExistente')) {
        return ['clienteExistente/cotacaoCnpjInvalido/karateTests/data/dados.csv'];
      }
      return ['clientePotencial/novoCliente/karateTests/data/clientes.csv'];
    }

    try {
      const files = await window.electronAPI!.invoke('list-data-files', featurePath);
      return files || [];
    } catch (error) {
      console.error('❌ Erro ao listar arquivos de dados:', error);
      return [];
    }
  }

  async readFileContent(relativePath: string): Promise<string> {
    if (!this.isElectronAvailable()) {
      // Conteúdo simulado para desenvolvimento web
      return this.getMockCsvContent();
    }

    try {
      const content = await window.electronAPI!.invoke('read-file-content', relativePath);
      return content;
    } catch (error) {
      console.error('❌ Erro ao ler arquivo:', error);
      return this.getMockCsvContent();
    }
  }

  private getMockCsvContent(): string {
    return `nome,cnpj,email,telefone
João Silva,12.345.678/0001-90,joao@empresa.com,11999999999
Maria Santos,98.765.432/0001-10,maria@empresa.com,11888888888`;
  }

  async saveCsvFile(relativePath: string, content: string): Promise<string> {
    if (!this.isElectronAvailable()) {
      console.log('💾 Salvamento simulado do arquivo:', relativePath);
      return 'Arquivo salvo com sucesso (simulado)';
    }

    try {
      const result = await window.electronAPI!.invoke('save-csv-file', {
        path: relativePath,
        content: content
      });
      return result;
    } catch (error) {
      console.error('❌ Erro ao salvar arquivo:', error);
      throw error;
    }
  }

  // Método público para verificar se está no modo Electron
  public get isElectronMode(): boolean {
    return this.isElectronAvailable();
  }
}

export const electronService = new ElectronService();
