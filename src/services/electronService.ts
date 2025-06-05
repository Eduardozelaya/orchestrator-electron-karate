
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
    return typeof window !== 'undefined' && !!window.electronAPI;
  }

  async getFeatureTests(): Promise<KarateFeatureTest[]> {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API não está disponível');
    }
    
    try {
      const results = await window.electronAPI!.invoke('get-feature-tests');
      console.log('📊 Features descobertas:', results);
      return results;
    } catch (error) {
      console.error('❌ Erro ao obter testes:', error);
      throw error;
    }
  }

  async runTests(selectedPaths: string[]): Promise<TestExecutionResult[]> {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API não está disponível');
    }

    try {
      const results = await window.electronAPI!.invoke('run-tests', selectedPaths);
      console.log('🚀 Resultados da execução:', results);
      return results;
    } catch (error) {
      console.error('❌ Erro ao executar testes:', error);
      throw error;
    }
  }

  async listDataFiles(featurePath: string): Promise<string[]> {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API não está disponível');
    }

    try {
      const files = await window.electronAPI!.invoke('list-data-files', featurePath);
      return files;
    } catch (error) {
      console.error('❌ Erro ao listar arquivos de dados:', error);
      return [];
    }
  }

  async readFileContent(relativePath: string): Promise<string> {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API não está disponível');
    }

    try {
      const content = await window.electronAPI!.invoke('read-file-content', relativePath);
      return content;
    } catch (error) {
      console.error('❌ Erro ao ler arquivo:', error);
      throw error;
    }
  }

  async saveCsvFile(relativePath: string, content: string): Promise<string> {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API não está disponível');
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
}

export const electronService = new ElectronService();
