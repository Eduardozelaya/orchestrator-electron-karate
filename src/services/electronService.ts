// Tipagens
interface ElectronAPI {
  selectMavenProject: () => Promise<{ success: boolean; projectRoot?: string; basePath?: string; error?: string }>;
  getFeatureTests: () => Promise<KarateTestsResult>;
  runTests: (paths: string[]) => Promise<TestExecutionResult[]>;
  listDataFiles: (path: string) => Promise<string[]>;
  readFileContent: (path: string) => Promise<string>;
  saveCsvFile: (args: { path: string; content: string }) => Promise<void>;
  openReport: (reportPath: string) => Promise<void>;
  uploadFile: (args: { path: string; content: ArrayBuffer }) => Promise<void>;
  downloadFile: (path: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  stopTestExecution: () => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

interface KarateFeatureTest {
  feature: string;
  scenarioName: string;
  category: string;
  dataFiles: string[];
  descriptionFiles: string[];
}

interface KarateTestsResult {
  [category: string]: KarateFeatureTest[];
}

interface TestExecutionResult {
  success: boolean;
  feature: string;
  report?: string;
  output?: string;
  error?: string;
}

export class ElectronService {
  private static instance: ElectronService;
  private _isElectronMode: boolean;

  private constructor() {
    this._isElectronMode = this.checkElectronMode();
  }

  static getInstance(): ElectronService {
    if (!ElectronService.instance) {
      ElectronService.instance = new ElectronService();
    }
    return ElectronService.instance;
  }

  private checkElectronMode(): boolean {
    if (typeof window === 'undefined') return false;
    return !!window.electronAPI;
  }

  get isElectronMode(): boolean {
    return this._isElectronMode;
  }

  async selectMavenProject(): Promise<{ success: boolean; projectRoot?: string; error?: string }> {
    if (!this.isElectronMode) {
      return { success: false, error: 'Electron não disponível' };
    }

    try {
      return await window.electronAPI!.selectMavenProject();
    } catch (error) {
      console.error('❌ Erro ao selecionar projeto:', error);
      return { success: false, error: 'Erro ao selecionar projeto' };
    }
  }

  async getFeatureTests(): Promise<KarateTestsResult> {
    if (!this.isElectronMode) {
      return this.getMockFeatureTests();
    }

    try {
      return await window.electronAPI!.getFeatureTests();
    } catch (error) {
      console.error('❌ Erro ao obter testes:', error);
      return this.getMockFeatureTests();
    }
  }

  async runTests(paths: string[]): Promise<TestExecutionResult[]> {
    if (!this.isElectronMode) {
      return this.simulateTestExecution(paths);
    }

    try {
      return await window.electronAPI!.runTests(paths);
    } catch (error) {
      console.error('❌ Erro ao executar testes:', error);
      throw error;
    }
  }

  async listDataFiles(featurePath: string): Promise<string[]> {
    if (!this.isElectronMode) {
      return this.getMockDataFiles(featurePath);
    }

    try {
      return await window.electronAPI!.listDataFiles(featurePath);
    } catch (error) {
      console.error('❌ Erro ao listar arquivos:', error);
      return [];
    }
  }

  async readFileContent(path: string): Promise<string> {
    if (!this.isElectronMode) {
      return this.getMockFileContent();
    }
  
    if (!path || typeof path !== 'string') {
      console.error('❌ Caminho inválido para leitura:', path);
      return '';
    }
  
    try {
      return await window.electronAPI!.readFileContent(path);
    } catch (error) {
      console.error('❌ Erro ao ler arquivo:', error);
      return '';
    }
  }
  
  async saveCsvFile(args: { path: string; content: string }): Promise<void> {
    if (!this.isElectronMode) {
      console.warn('Modo Electron não disponível — simulação de salvamento');
      return;
    }
  
    try {
      await window.electronAPI!.saveCsvFile(args);
    } catch (error) {
      console.error('❌ Erro ao salvar arquivo CSV:', error);
      throw error;
    }
  }
  
  async openReport(reportPath: string): Promise<void> {
    if (!this.isElectronMode) {
      console.warn('Modo Electron não disponível — simulação de abertura de relatório');
      return;
    }
  
    try {
      // Remover prefixo "file://" se presente
      const cleanPath = reportPath.replace(/^file:\/+/, '');
      await window.electronAPI!.openReport(cleanPath);
    } catch (error) {
      console.error('❌ Erro ao abrir relatório:', error);
    }
  }
  
  async uploadFile(path: string, file: File): Promise<void> {
    if (!this.isElectronMode) {
      console.warn('Modo Electron não disponível');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const args = {
        path: path,
        content: buffer
      };
      await window.electronAPI!.uploadFile(args);
    } catch (error) {
      console.error('❌ Erro ao fazer upload do arquivo:', error);
      throw error;
    }
  }

  async downloadFile(path: string): Promise<void> {
    if (!this.isElectronMode) {
      console.warn('Modo Electron não disponível');
      return;
    }

    try {
      await window.electronAPI!.downloadFile(path);
    } catch (error) {
      console.error('❌ Erro ao fazer download do arquivo:', error);
      throw error;
    }
  }

  async deleteFile(path: string): Promise<void> {
    if (!this.isElectronMode) {
      console.warn('Modo Electron não disponível');
      return;
    }

    try {
      await window.electronAPI!.deleteFile(path);
    } catch (error) {
      console.error('❌ Erro ao deletar arquivo:', error);
      throw error;
    }
  }

  async stopTestExecution(): Promise<boolean> {
    if (!this.isElectronMode) {
      return true; // No modo simulado, sempre retorna sucesso
    }

    try {
      const result = await window.electronAPI!.stopTestExecution();
      return result.success;
    } catch (error) {
      console.error('❌ Erro ao tentar parar execução:', error);
      return false;
    }
  }

  // Métodos privados para mock data
  private getMockFeatureTests(): KarateTestsResult {
    return {
      'Cliente Existente': [
        {
          feature: 'clienteExistente/cotacaoCnpj/karateTests/UITests/cotizador.feature',
          scenarioName: 'cotacaoCnpj',
          category: 'Cliente Existente',
          dataFiles: ['clienteExistente/cotacaoCnpj/data/dados.csv'],
          descriptionFiles: []
        }
      ],
      'Testes Disponíveis': [
        {
          feature: 'cenarioSimples/karateTests/UITests/cotizador.feature',
          scenarioName: 'cenarioSimples',
          category: 'Testes Disponíveis',
          dataFiles: ['cenarioSimples/data/dados.csv'],
          descriptionFiles: []
        }
      ]
    };
  }

  private getMockDataFiles(featurePath: string): string[] {
    return [`${featurePath.replace('.feature', '')}/data/mock.csv`];
  }

  private getMockFileContent(): string {
    return 'id,nome,valor\n1,Teste 1,100\n2,Teste 2,200';
  }

  private simulateTestExecution(paths: string[]): Promise<TestExecutionResult[]> {
    return Promise.resolve(
      paths.map(path => ({
        success: Math.random() > 0.2,
        feature: path,
        report: 'mock-report.html',
        output: 'Execução simulada concluída'
      }))
    );
  }
}

export const electronService = ElectronService.getInstance();
