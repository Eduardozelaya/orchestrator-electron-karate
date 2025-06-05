
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ProjectUploader from '@/components/ProjectUploader';
import TestSelector from '@/components/TestSelector';
import TestExecutor from '@/components/TestExecutor';
import { FolderOpen, Play, Settings } from 'lucide-react';

interface KarateTest {
  id: string;
  name: string;
  path: string;
  category: string;
  scenarios: string[];
  enabled: boolean;
}

const Index = () => {
  const [projectPath, setProjectPath] = useState<string>('');
  const [discoveredTests, setDiscoveredTests] = useState<KarateTest[]>([]);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  // Mock data baseado na imagem fornecida
  const mockTests: KarateTest[] = [
    {
      id: '1',
      name: 'cotacaoCnpj',
      path: 'clienteExistente/cotacaoCnpjInvalido/karateTests/UITests/cotizador.feature',
      category: 'Cliente Existente',
      scenarios: ['Validar CNPJ inválido', 'Verificar mensagem de erro'],
      enabled: true
    },
    {
      id: '2',
      name: 'cotacaoCnpjInvalido',
      path: 'clienteExistente/cotacaoCnpjInvalido/karateTests/UITests/cotizador.feature',
      category: 'Cliente Existente',
      scenarios: ['Teste de CNPJ inválido'],
      enabled: false
    },
    {
      id: '3',
      name: 'cotacaoIdCliente',
      path: 'clienteExistente/cotacaoIdCliente/karateTests/UITests/cotizador.feature',
      category: 'Cliente Existente',
      scenarios: ['Validar ID do cliente'],
      enabled: false
    },
    {
      id: '4',
      name: 'cotacaoIdClienteInvalido',
      path: 'clienteExistente/cotacaoIdClienteInvalido/karateTests/UITests/cotizador.feature',
      category: 'Cliente Existente',
      scenarios: ['Teste de ID inválido'],
      enabled: false
    },
    {
      id: '5',
      name: 'cotacaoRazaoSocial',
      path: 'clienteExistente/cotacaoRazaoSocial/karateTests/UITests/cotizador.feature',
      category: 'Cliente Existente',
      scenarios: ['Validar razão social'],
      enabled: false
    },
    {
      id: '6',
      name: 'cotacaoRazaoSocialInvalido',
      path: 'clienteExistente/cotacaoRazaoSocialInvalido/karateTests/UITests/cotizador.feature',
      category: 'Cliente Existente',
      scenarios: ['Teste razão social inválida'],
      enabled: false
    },
    {
      id: '7',
      name: 'verificatOMVazia',
      path: 'clienteExistente/verificatOMVazia/karateTests/UITests/cotizador.feature',
      category: 'Cliente Existente',
      scenarios: ['Verificar OM vazia'],
      enabled: false
    },
    {
      id: '8',
      name: 'verificacaoClientesSimilares',
      path: 'clientePotencial/verificacaoClientesSimilaresExcel/karateTests/UITests/cotizador.feature',
      category: 'Cliente Potencial',
      scenarios: ['Verificar clientes similares'],
      enabled: false
    }
  ];

  const handleProjectLoad = (path: string) => {
    setProjectPath(path);
    setIsScanning(true);
    
    // Simular escaneamento de arquivos
    setTimeout(() => {
      setDiscoveredTests(mockTests);
      setIsScanning(false);
    }, 2000);
  };

  const handleTestSelection = (testIds: string[]) => {
    setSelectedTests(testIds);
  };

  const handleExecuteSelected = () => {
    const selected = discoveredTests.filter(test => selectedTests.includes(test.id));
    console.log('Executando testes selecionados:', selected);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-800 mb-2">
            Gerenciador de Testes Karate
          </h1>
          <p className="text-lg text-slate-600">
            Descubra, selecione e execute testes Karate dinamicamente
          </p>
        </div>

        {/* Project Upload Section */}
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
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
