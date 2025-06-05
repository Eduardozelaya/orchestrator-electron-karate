import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Play, Square, Clock, CheckCircle, XCircle, AlertCircle, ExternalLink } from 'lucide-react';
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

interface TestExecutorProps {
  selectedTests: string[];
  tests: KarateTest[];
  onExecute: () => void;
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
  onExecute,
  isElectronMode = false
}) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResults, setExecutionResults] = useState<ExecutionResult[]>([]);
  const [progress, setProgress] = useState(0);

  const selectedTestObjects = tests.filter(test => selectedTests.includes(test.id));

  const handleExecute = async () => {
    if (selectedTests.length === 0) {
      toast.error('Selecione pelo menos um teste para executar');
      return;
    }

    setIsExecuting(true);
    setProgress(0);
    setExecutionResults([]);
    
    if (!isElectronMode) {
      toast.warning('Execução simulada - Use o modo Electron para execução real');
      await simulateExecution();
    } else {
      toast.success(`Iniciando execução de ${selectedTests.length} teste(s) no Karate`);
      await executeRealTests();
    }

    onExecute();
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

    setIsExecuting(false);
  };

  const executeRealTests = async () => {
    try {
      const { electronService } = await import('@/services/electronService');
      
      const selectedPaths = selectedTestObjects.map(test => test.path);
      
      setExecutionResults(
        selectedTests.map(testId => ({ testId, status: 'pending' as const }))
      );

      const results = await electronService.runTests(selectedPaths);
      
      const processedResults = selectedTests.map((testId, index) => {
        const test = tests.find(t => t.id === testId);
        const electronResult = results[index];
        
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
          duration: 0 // Duração não disponível no formato atual
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
    } finally {
      setIsExecuting(false);
    }
  };

  const handleStop = () => {
    setIsExecuting(false);
    toast.warning('Execução interrompida pelo usuário');
  };

  const handleOpenReport = (reportUrl: string) => {
    if (reportUrl) {
      window.open(reportUrl, '_blank');
    }
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
        <div className="space-y-3">
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
      </div>

      {/* Execution Results */}
      {executionResults.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Resultados da Execução</span>
              {totalDuration > 0 && (
                <Badge variant="outline" className="text-xs">
                  {(totalDuration / 1000).toFixed(1)}s total
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {executionResults.map((result) => {
              const test = tests.find(t => t.id === result.testId);
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
                          className="h-6 px-2 text-xs"
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Relatório
                        </Button>
                      )}
                    </div>
                  </div>
                  
                  {result.error && (
                    <div className="ml-6 text-xs text-red-600 bg-red-50 p-2 rounded">
                      {result.error}
                    </div>
                  )}
                  
                  {result.scenarios && result.scenarios.length > 0 && (
                    <div className="ml-6 space-y-1">
                      {result.scenarios.map((scenario, index) => (
                        <div key={index} className="flex items-center gap-2 text-xs">
                          {scenario.status === 'passed' ? (
                            <CheckCircle className="h-3 w-3 text-green-600" />
                          ) : (
                            <XCircle className="h-3 w-3 text-red-600" />
                          )}
                          <span className={scenario.status === 'passed' ? 'text-green-700' : 'text-red-700'}>
                            {scenario.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
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
