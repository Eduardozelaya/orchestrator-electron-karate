
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ProjectUploader from '@/components/ProjectUploader';
import TestSelector from '@/components/TestSelector';
import TestExecutor from '@/components/TestExecutor';
import DataFileViewer from '@/components/DataFileViewer';
import { FolderOpen, Play, Settings, Zap } from 'lucide-react';
import { electronService } from '@/services/electronService';
import { toast } from 'sonner';

interface KarateTest {
  id: string;
  name: string;
  path: string;
  category: string;
  scenarios: string[];
  enabled: boolean;
  dataFiles?: string[];
}

const Index = () => {
  const [projectPath, setProjectPath] = useState<string>('');
  const [discoveredTests, setDiscoveredTests] = useState<KarateTest[]>([]);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isElectronMode, setIsElectronMode] = useState(false);
  const [dataFileViewer, setDataFileViewer] = useState<{
    isOpen: boolean;
    testId: string;
    dataFile: string;
  }>({
    isOpen: false,
    testId: '',
    dataFile: ''
  });

  useEffect(() => {
    // Verificar se está rodando no Electron
    const checkElectronMode = () => {
      const hasElectronAPI = typeof window !== 'undefined' && !!window.electronAPI;
      setIsElectronMode(hasElectronAPI);
      
      if (hasElectronAPI) {
        toast.success('Modo Electron detectado - Funcionalidades completas disponíveis!');
        // Auto-carregar testes se estiver no Electron
        handleElectronScan();
      } else {
        toast.info('Modo Web - Use a interface de upload para carregar projetos');
      }
    };

    checkElectronMode();
  }, []);

  const handleElectronScan = async () => {
    if (!isElectronMode) return;

    setIsScanning(true);
    setProjectPath('Projeto Karate Local');
    
    try {
      const featureTests = await electronService.getFeatureTests();
      
      // Converter dados do Electron para o formato esperado
      const convertedTests: KarateTest[] = featureTests.map((test, index) => {
        const pathParts = test.feature.split('/');
        const category = pathParts[0] || 'default';
        const testName = pathParts[1] || `test-${index}`;
        
        return {
          id: `electron-${index}`,
          name: testName,
          path: test.feature,
          category: category,
          scenarios: [], // Não disponível no formato do Electron
          enabled: true,
          dataFiles: test.dataFiles
        };
      });

      setDiscoveredTests(convertedTests);
      toast.success(`${convertedTests.length} testes descobertos!`);
      
    } catch (error) {
      console.error('Erro ao escanear testes:', error);
      toast.error('Erro ao escanear testes do projeto Karate');
    } finally {
      setIsScanning(false);
    }
  };

  const handleProjectLoad = async (path: string) => {
    if (isElectronMode) {
      // Se estiver no Electron, re-escanear
      await handleElectronScan();
    } else {
      // Modo web - simular carregamento
      setProjectPath(path);
      setIsScanning(true);
      
      // Mock data para modo web
      const mockTests: KarateTest[] = [
        {
          id: '1',
          name: 'cotacaoCnpj',
          path: 'clienteExistente/cotacaoCnpjInvalido/karateTests/UITests/cotizador.feature',
          category: 'clienteExistente',
          scenarios: ['Validar CNPJ inválido', 'Verificar mensagem de erro'],
          enabled: true,
          dataFiles: ['clienteExistente/cotacaoCnpjInvalido/karateTests/data/dados.csv']
        },
        {
          id: '2',
          name: 'cotacaoCnpjInvalido',
          path: 'clienteExistente/cotacaoCnpjInvalido/karateTests/UITests/cotizador.feature',
          category: 'clienteExistente',
          scenarios: ['Teste de CNPJ inválido'],
          enabled: false
        }
      ];
      
      setTimeout(() => {
        setDiscoveredTests(mockTests);
        setIsScanning(false);
        toast.success('Projeto simulado carregado!');
      }, 2000);
    }
  };

  const handleTestSelection = (testIds: string[]) => {
    setSelectedTests(testIds);
  };

  const handleExecuteSelected = async () => {
    if (!isElectronMode) {
      toast.warning('Execução real de testes disponível apenas no modo Electron');
      return;
    }

    const selectedPaths = discoveredTests
      .filter(test => selectedTests.includes(test.id))
      .map(test => test.path);

    if (selectedPaths.length === 0) {
      toast.error('Selecione pelo menos um teste para executar');
      return;
    }

    try {
      toast.info(`Executando ${selectedPaths.length} teste(s)...`);
      const results = await electronService.runTests(selectedPaths);
      
      const passed = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      if (failed === 0) {
        toast.success(`Todos os ${passed} testes passaram! 🎉`);
      } else {
        toast.error(`${failed} teste(s) falharam de ${results.length} executados`);
      }
      
      console.log('Resultados da execução:', results);
      
    } catch (error) {
      console.error('Erro ao executar testes:', error);
      toast.error('Erro ao executar testes selecionados');
    }
  };

  const handleDataFileView = (testId: string, dataFile: string) => {
    setDataFileViewer({
      isOpen: true,
      testId,
      dataFile
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-800 mb-2 flex items-center justify-center gap-3">
            <Zap className="h-10 w-10 text-blue-600" />
            Gerenciador de Testes Karate
          </h1>
          <p className="text-lg text-slate-600">
            Descubra, selecione e execute testes Karate dinamicamente
          </p>
          {isElectronMode && (
            <Badge className="mt-2 bg-green-100 text-green-700">
              Modo Electron Ativo
            </Badge>
          )}
        </div>

        {/* Project Upload Section */}
        {!isElectronMode && (
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-slate-800">
                <FolderOpen className="h-5 w-5 text-blue-600" />
                Carregar Projeto
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ProjectUploader onProjectLoad={handleProjectLoad} />
              {projectPath && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-800">
                    <strong>Projeto carregado:</strong> {projectPath}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Electron Auto-Scan Button */}
        {isElectronMode && (
          <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-slate-800">
                <Zap className="h-5 w-5 text-green-600" />
                Projeto Karate Local
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 mb-2">
                    Escaneie automaticamente o projeto Karate configurado
                  </p>
                  {projectPath && (
                    <p className="text-xs text-green-600 font-medium">
                      {discoveredTests.length} testes descobertos
                    </p>
                  )}
                </div>
                <Button 
                  onClick={handleElectronScan}
                  disabled={isScanning}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {isScanning ? 'Escaneando...' : 'Escanear Testes'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Test Discovery and Selection */}
        {(discoveredTests.length > 0 || isScanning) && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Test List */}
            <div className="lg:col-span-2">
              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-slate-800">
                      <Settings className="h-5 w-5 text-green-600" />
                      Testes Descobertos
                    </span>
                    <Badge variant="secondary" className="bg-green-100 text-green-700">
                      {discoveredTests.length} encontrados
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TestSelector
                    tests={discoveredTests}
                    selectedTests={selectedTests}
                    onSelectionChange={handleTestSelection}
                    isScanning={isScanning}
                    onDataFileView={handleDataFileView}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Execution Panel */}
            <div className="lg:col-span-1">
              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-slate-800">
                    <Play className="h-5 w-5 text-orange-600" />
                    Execução
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TestExecutor
                    selectedTests={selectedTests}
                    tests={discoveredTests}
                    onExecute={handleExecuteSelected}
                    isElectronMode={isElectronMode}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Data File Viewer */}
        <DataFileViewer
          isOpen={dataFileViewer.isOpen}
          onClose={() => setDataFileViewer({ isOpen: false, testId: '', dataFile: '' })}
          testId={dataFileViewer.testId}
          dataFile={dataFileViewer.dataFile}
        />
      </div>
    </div>
  );
};

export default Index;
