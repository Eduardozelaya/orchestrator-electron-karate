import { useAuthStore } from "../stores/auth";
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import TestSelector from '@/components/TestSelector';
import TestExecutor from '@/components/TestExecutor';
import DataFileViewer from '@/components/DataFileViewer';
import { FolderOpen, Play, Settings, Zap, User } from 'lucide-react';
import { electronService } from '@/services/electronService';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

import { KarateTest } from '@/types/KarateTest';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const Index = () => {
  const { username, password, setUsername, setPassword, setHasLoadedProject, setUltimoSistema } = useAuthStore();
  const [projectPath, setProjectPath] = useState<string>('');
  const [discoveredTests, setDiscoveredTests] = useState<KarateTest[]>([]);
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dataFileViewer, setDataFileViewer] = useState({
    isOpen: false,
    testId: '',
    dataFile: ''
  });

  const isElectronMode = electronService.isElectronMode;
  const navigate = useNavigate();
  const { setUnidade } = useAuthStore();
  const [credenciais, setCredenciais] = useState<{[sistema: string]: {usuario: string, senha: string, unidade: string}}>({});
  const [sistemaSelecionado, setSistemaSelecionado] = useState<string>("");
  const [unidadeSelecionada, setUnidadeSelecionada] = useState<string>("");

  useEffect(() => {
    const creds = JSON.parse(localStorage.getItem('credenciais') || '{}');
    setCredenciais(creds);
    // Se já houver um sistema salvo, selecione-o
    if (Object.keys(creds).length > 0) {
      const sistema = useAuthStore.getState().ultimoSistema || Object.keys(creds)[0];
      setSistemaSelecionado(sistema);
      setUsername(creds[sistema].usuario);
      setPassword(creds[sistema].senha);
    }
  }, [setUsername, setPassword]);

  useEffect(() => {
    if (isElectronMode && username && password) {
      handleLoadTests();
    }
  }, [isElectronMode, username, password]);

  useEffect(() => {
    if (!username || !password) {
      toast.error('Usuário e senha são obrigatórios');
      navigate('/Login');
    }
  }, [username, password, navigate]);

  const handleLoadTests = async () => {
    setIsLoading(true);
    try {
      if (isElectronMode) {
        const projectResult = await electronService.selectMavenProject();
        if (!projectResult.success) {
          throw new Error(projectResult.error);
        }
        setProjectPath(projectResult.projectRoot || '');
        setHasLoadedProject(true);
      }

      await refreshTests();
    } catch (error) {
      console.error('Erro ao carregar cenários:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar cenários');
    } finally {
      setIsLoading(false);
    }
  };

  const refreshTests = async () => {
    try {
      const testResults = await electronService.getFeatureTests();
      const convertedTests: KarateTest[] = Object.entries(testResults).flatMap(
        ([category, tests]) =>
          tests.map((test, index) => ({
            id: `${category}-${index}`,
            name: `Cenário: ${test.scenarioName}`,
            path: test.feature,
            category: test.category,
            enabled: true,
            dataFiles: test.dataFiles,
            descriptionFiles: test.descriptionFiles,
            scenarios: []
          }))
      );

      setDiscoveredTests(convertedTests);
      toast.success(`${convertedTests.length} cenários encontrados`);
    } catch (error) {
      console.error('Erro ao atualizar cenários:', error);
      toast.error('Erro ao atualizar lista de cenários');
    }
  };

  const handleSistemaChange = (sistema: string) => {
    setSistemaSelecionado(sistema);
    setUsername(credenciais[sistema].usuario);
    setPassword(credenciais[sistema].senha);
    setUltimoSistema(sistema);
  };

  const handleTestSelection = (testIds: string[]) => {
    setSelectedTests(testIds);
  };

  useEffect(() => {
    const lastPath = localStorage.getItem('ultimoProjectPath');
    if (lastPath) {
      setProjectPath(lastPath);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">  
            <Button
              variant="outline"
              onClick={() => navigate('/login')}
              className="flex items-center gap-1"
            >
              Voltar
            </Button>
            <h1 className="text-2xl font-bold text-slate-800">
              Orquestrador de Testes Karate
            </h1>
          </div>
          <Button
            onClick={handleLoadTests}
            variant="outline"
            className="flex items-center gap-2"
            disabled={isLoading}
          >
            <FolderOpen className="h-4 w-4" />
            {isLoading ? 'Carregando...' : 'Carregar Testes'}
          </Button>
        </div>

        <Card className="bg-white/70 backdrop-blur border rounded-lg p-4 flex flex-col md:flex-row items-center gap-6 mb-2">
          <div className="flex-1 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-blue-600" />
              <Select value={sistemaSelecionado} onValueChange={handleSistemaChange}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Selecione o sistema" />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(credenciais).map(sistema => (
                    <SelectItem key={sistema} value={sistema}>
                      {sistema.charAt(0).toUpperCase() + sistema.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-slate-700 space-y-1 mt-2">
              <p>
                <span className="font-semibold">Sistema:</span> {sistemaSelecionado || <span className="italic text-slate-400">não definido</span>}
              </p>
              <p>
                <span className="font-semibold">Usuário:</span> {username || <span className="italic text-slate-400">não definido</span>}
              </p>
              <p>
                <span className="font-semibold">Senha:</span> {password ? "•".repeat(password.length) : <span className="italic text-slate-400">não definida</span>}
              </p>
            </div>
          </div>
        </Card>

        {/* Project Path */}
        {projectPath && (
          <div className="bg-white/50 backdrop-blur border rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Zap className="h-4 w-4 text-yellow-600" />
              <span>Projeto: {projectPath}</span>
            </div>
          </div>
        )}

        {discoveredTests.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Settings className="h-5 w-5 text-green-600" />
                      Cenários Disponíveis
                    </span>
                    <Badge variant="secondary" className="bg-green-100 text-green-700">
                      {selectedTests.length} selecionados
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TestSelector
                    tests={discoveredTests}
                    selectedTests={selectedTests}
                    onSelectionChange={handleTestSelection}
                    isScanning={isLoading}
                    onDataFileView={(testId, dataFile) =>
                      setDataFileViewer({ isOpen: true, testId, dataFile })}
                    onRefresh={refreshTests}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-1">
              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2">
                    <Play className="h-5 w-5 text-orange-600" />
                    Execução
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <TestExecutor
                    selectedTests={selectedTests}
                    tests={discoveredTests}
                    isElectronMode={isElectronMode}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        )}

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
