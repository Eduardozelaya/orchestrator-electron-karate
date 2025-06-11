import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Play, Square, Clock, CheckCircle, XCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { electronService } from '@/services/electronService';

interface KarateTest {
  id: string;
  name: string;
  path: string;
  category: string;
  scenarios: string[];
  enabled: boolean;
  dataFiles?: string[];
}

interface TestExecutionResult {
  success: boolean;
  report?: string;
  error?: string;
  duration?: number;
}

interface TestExecutorProps {
  selectedTests: string[];
  tests: KarateTest[];
  isElectronMode?: boolean;
}

interface ExecutionResult {
  testId: string;
  status: 'running' | 'passed' | 'failed' | 'pending';
  duration?: number;
  scenarios?: { name: string; status: 'passed' | 'failed' }[];
  reportUrl?: string;
  error?: string;
}

const TestExecutor: React.FC<TestExecutorProps> = ({
  selectedTests,
  tests,
  isElectronMode = false
}) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResults, setExecutionResults] = useState<ExecutionResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [generalReportUrl, setGeneralReportUrl] = useState<string | null>(null);

  const selectedTestObjects = tests.filter(test => selectedTests.includes(test.id));

  const handleExecute = async () => {
    if (selectedTests.length === 0) {
      toast.error('Selecione pelo menos um teste para executar');
      return;
    }

    setIsExecuting(true);
    setProgress(0);
    setExecutionResults([]);
    
    try {
      if (!isElectronMode) {
        toast.warning('Execução simulada - Use o modo Electron para execução real');
        await simulateExecution();
      } else {
        toast.success(`Iniciando execução de ${selectedTests.length} teste(s) no Karate`);
        await executeRealTests();
      }
    } finally {
      setIsExecuting(false);
    }
  };

  const simulateExecution = async () => {
    for (let i = 0; i < selectedTests.length; i++) {
      const testId = selectedTests[i];
      const test = tests.find(t => t.id === testId);
      
      setExecutionResults(prev => [
        ...prev,
        { testId, status: 'running' }
      ]);

      await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));

      const success = Math.random() > 0.3;
      const duration = Math.floor(Math.random() * 5000 + 500);
      
      const scenarioResults = test?.scenarios.map(scenario => ({
        name: scenario,
        status: (Math.random() > 0.2 ? 'passed' : 'failed') as 'passed' | 'failed'
      })) || [];

      setExecutionResults(prev => 
        prev.map(result => 
          result.testId === testId 
            ? { 
                ...result, 
                status: success ? 'passed' : 'failed',
                duration,
                scenarios: scenarioResults
              }
            : result
        )
      );

      setProgress(((i + 1) / selectedTests.length) * 100);
    }
  };

  const executeRealTests = async () => {
    try {
      // Criar um mapa dos testes selecionados para manter a ordem
      const selectedTestsMap = new Map(
        selectedTests.map((testId, index) => [testId, index])
      );
      
      // Inicializar resultados na ordem dos testes selecionados
      setExecutionResults(
        selectedTests.map(testId => ({ testId, status: 'pending' as const }))
      );

      // Executar os testes mantendo a ordem original
      const selectedPaths = selectedTests.map(testId => {
        const test = tests.find(t => t.id === testId);
        return test?.path || '';
      });

      const results = await electronService.runTests(selectedPaths);
      
      if (results.length > 0 && results[0].report) {
        setGeneralReportUrl(results[0].report);
      }

      // Processar resultados mantendo a ordem original dos testes selecionados
      const processedResults = selectedTests.map(testId => {
        const originalIndex = selectedTestsMap.get(testId);
        const electronResult = results[originalIndex] as TestExecutionResult;
        
        if (!electronResult) {
          return {
            testId,
            status: 'failed' as const,
            error: 'Resultado não encontrado'
          };
        }

        return {
          testId,
          status: electronResult.success ? 'passed' as const : 'failed' as const,
          reportUrl: electronResult.report,
          error: electronResult.error,
          duration: electronResult.duration || 0
        };
      });

      setExecutionResults(processedResults);
      setProgress(100);
      
      const passed = processedResults.filter(r => r.status === 'passed').length;
      const failed = processedResults.length - passed;
      
      if (failed === 0) {
        toast.success(`Todos os ${selectedTests.length} testes passaram! 🎉`);
      } else {
        toast.error(`${failed} teste(s) falharam de ${selectedTests.length} executados`);
      }
      
    } catch (error) {
      toast.error('Erro durante a execução dos testes');
      console.error('Erro na execução:', error);
      
      setExecutionResults(
        selectedTests.map(testId => ({
          testId,
          status: 'failed' as const,
          error: 'Erro na execução'
        }))
      );
    }
  };

  const handleStop = () => {
    setIsExecuting(false);
    toast.warning('Execução interrompida pelo usuário');
  };

  const handleOpenReport = (reportUrl: string) => {
    if (!reportUrl) return;
  
    if (isElectronMode) {
      electronService.openReport(reportUrl);
    } else {
      window.open(reportUrl, '_blank'); // modo web (talvez simulado)
    }
  };

  const handleOpenAllReports = () => {
    // Filter out results with valid report URLs and open them
    executionResults
      .filter(result => result.reportUrl)
      .forEach(result => {
        if (result.reportUrl) {
          handleOpenReport(result.reportUrl);
        }
      });
  };
  

  const getStatusIcon = (status: ExecutionResult['status']) => {
    switch (status) {
      case 'running':
        return <Clock className="h-4 w-4 text-blue-600 animate-pulse" />;
      case 'passed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const totalDuration = executionResults
    .filter(r => r.duration)
    .reduce((sum, r) => sum + (r.duration || 0), 0);

  return (
    <div className="space-y-4">
      {/* Execution Controls */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-slate-800">Testes Selecionados</h4>
          <Badge variant="secondary">
            {selectedTests.length} teste(s)
          </Badge>
        </div>

        {/* Mode Indicator */}
        <div className="text-xs p-2 rounded border">
          {isElectronMode ? (
            <span className="text-green-600 font-medium">
              ⚡ Modo Electron - Execução real com Maven/Karate
            </span>
          ) : (
            <span className="text-orange-600 font-medium">
              🌐 Modo Web - Execução simulada
            </span>
          )}
        </div>

        {selectedTests.length > 0 && (
          <div className="space-y-2">
            {selectedTestObjects.map((test) => (
              <div key={test.id} className="text-sm p-2 bg-slate-50 rounded border">
                <div className="font-medium text-slate-700">{test.name}</div>
                <div className="text-xs text-slate-500">{test.category}</div>
              </div>
            ))}
          </div>
        )}

        <Separator />

        {/* Execution Button */}
        {!isExecuting ? (
          <Button 
            onClick={handleExecute}
            disabled={selectedTests.length === 0}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            <Play className="h-4 w-4 mr-2" />
            {isElectronMode ? 'Executar com Karate' : 'Simular Execução'}
          </Button>
        ) : (
          <Button 
            onClick={handleStop}
            variant="destructive"
            className="w-full"
          >
            <Square className="h-4 w-4 mr-2" />
            Parar Execução
          </Button>
        )}

        {isExecuting && (
          <div className="space-y-2">
            <Progress value={progress} className="w-full" />
            <p className="text-xs text-center text-slate-600">
              {Math.round(progress)}% concluído
            </p>
          </div>
        )}
      </div>

      {/* Execution Results */}
      {executionResults.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>Resultados da Execução</span>
                {executionResults.some(r => r.reportUrl) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleOpenAllReports}
                    className="h-6 px-2 text-xs hover:bg-slate-100"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Ver Relatório Completo
                  </Button>
                )}
              </div>
              {totalDuration > 0 && (
                <Badge variant="outline" className="text-xs">
                  {(totalDuration / 1000).toFixed(1)}s total
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Garantir que os resultados são exibidos na mesma ordem dos testes selecionados */}
            {selectedTests.map(testId => {
              const result = executionResults.find(r => r.testId === testId);
              if (!result) return null;
              
              const test = tests.find(t => t.id === testId);
              return (
                <div key={result.testId} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(result.status)}
                      <span className="font-medium text-sm">{test?.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {result.duration && (
                        <Badge variant="outline" className="text-xs">
                          {(result.duration / 1000).toFixed(1)}s
                        </Badge>
                      )}
                      {result.reportUrl && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenReport(result.reportUrl!)}
                          className="h-6 px-2 text-xs flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Karate Log
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TestExecutor;