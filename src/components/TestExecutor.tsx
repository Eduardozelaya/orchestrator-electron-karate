import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Play, Square, Clock, CheckCircle, XCircle, AlertCircle, ExternalLink, Loader2, ChevronDown, ChevronRight, Image } from 'lucide-react';
import { toast } from 'sonner';
import { electronService, RowProgressEvent } from '@/services/electronService';
import { useAuthStore } from '@/stores/auth';

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

interface RowStatus {
  index: number;
  label: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  currentStep?: string;
  lastStep?: string;
  startTime?: number;
  duration?: number;
  errorMessage?: string;
  endMessage?: string;
  screenshots?: string[];
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
  const [projectPath, setProjectPath] = useState('');

  // Estado de progresso por linha do CSV
  const [totalRows, setTotalRows] = useState(0);
  const [rowStatuses, setRowStatuses] = useState<RowStatus[]>([]);
  const cleanupRef = useRef<(() => void) | null>(null);

  const selectedTestObjects = tests.filter(test => selectedTests.includes(test.id));

  // Subscrever aos eventos de progresso em tempo real
  useEffect(() => {
    if (!isExecuting || !isElectronMode) return;

    const cleanup = electronService.onRowProgress((event: RowProgressEvent) => {
      switch (event.type) {
        case 'ROW_TOTAL':
          setTotalRows(event.totalRows || 0);
          setRowStatuses(
            Array.from({ length: event.totalRows || 0 }, (_, i) => ({
              index: i,
              label: `Linha ${i + 1}`,
              status: 'pending' as const,
              screenshots: []
            }))
          );
          break;

        case 'ROW_START':
          setRowStatuses(prev => prev.map(row =>
            row.index === event.rowIndex
              ? { ...row, status: 'running', label: event.label || `Linha ${(event.rowIndex || 0) + 1}`, startTime: Date.now() }
              : row
          ));
          break;

        case 'ROW_END': {
          const endTime = Date.now();
          setRowStatuses(prev => {
            const updated = prev.map(row => {
              if (row.index !== event.rowIndex) return row;
              const duration = row.startTime ? endTime - row.startTime : undefined;
              return {
                ...row,
                status: event.status === 'PASSED' ? 'passed' as const : 'failed' as const,
                lastStep: row.currentStep,
                duration
              };
            });
            const completed = updated.filter(r => r.status === 'passed' || r.status === 'failed').length;
            if (updated.length > 0) {
              setProgress((completed / updated.length) * 100);
            }
            return updated;
          });
          break;
        }

        case 'ROW_END_MSG':
          setRowStatuses(prev => prev.map(row =>
            row.index === event.rowIndex
              ? { ...row, endMessage: event.message }
              : row
          ));
          break;

        case 'ROW_FAIL_REASON':
          setRowStatuses(prev => prev.map(row =>
            row.index === event.rowIndex
              ? { ...row, errorMessage: event.error }
              : row
          ));
          break;

        case 'STEP':
          setRowStatuses(prev => prev.map(row =>
            row.index === event.rowIndex
              ? { ...row, currentStep: event.step }
              : row
          ));
          break;

        case 'SCREENSHOT_FAIL':
          setRowStatuses(prev => prev.map(row =>
            row.index === event.rowIndex
              ? { ...row, errorMessage: event.error }
              : row
          ));
          break;

        case 'SCREENSHOT':
          setRowStatuses(prev => prev.map(row =>
            row.index === event.rowIndex
              ? { ...row, screenshots: [...(row.screenshots || []), event.name || ''] }
              : row
          ));
          break;
      }
    });

    cleanupRef.current = cleanup;
    return () => {
      cleanup();
      cleanupRef.current = null;
    };
  }, [isExecuting, isElectronMode]);

  const handleExecute = async () => {
    if (selectedTests.length === 0) {
      toast.error('Selecione pelo menos um teste para executar');
      return;
    }

    setIsExecuting(true);
    setProgress(0);
    setExecutionResults([]);
    setTotalRows(0);
    setRowStatuses([]);

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
      const selectedTestsMap = new Map(
        selectedTests.map((testId, index) => [testId, index])
      );

      setExecutionResults(
        selectedTests.map(testId => ({ testId, status: 'pending' as const }))
      );

      const selectedPaths = selectedTests.map(testId => {
        const test = tests.find(t => t.id === testId);
        return test?.path || '';
      });
      const { username, password } = useAuthStore.getState();

      const results = await electronService.runTests(selectedPaths, username, password);

      if (results.length > 0 && results[0].report) {
        setGeneralReportUrl(results[0].report);
      }

      const processedResults = selectedTests.map(testId => {
        const originalIndex = selectedTestsMap.get(testId);
        const electronResult = results[originalIndex!] as TestExecutionResult;

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

      // Marcar linhas sem ROW_END como failed
      setRowStatuses(prev => prev.map(row =>
        row.status === 'running' || row.status === 'pending'
          ? { ...row, status: 'failed' }
          : row
      ));

      const passed = processedResults.filter(r => r.status === 'passed').length;
      const failed = processedResults.length - passed;

      // Mensagem descritiva final baseada nos resultados por linha
      setRowStatuses(prev => {
        const rowPassed = prev.filter(r => r.status === 'passed').length;
        const rowFailed = prev.filter(r => r.status === 'failed').length;
        const rowTotal = prev.length;

        if (rowTotal > 0) {
          const failedIndices = prev
            .filter(r => r.status === 'failed')
            .map(r => r.index + 1);

          if (rowFailed === 0) {
            toast.success(`${rowPassed} de ${rowTotal} NFs criadas com sucesso.`);
          } else {
            toast.error(
              `${rowPassed} de ${rowTotal} NFs criadas com sucesso. Falhas nas linhas ${failedIndices.join(', ')}.`
            );
          }
        } else if (failed === 0) {
          toast.success(`Todos os ${selectedTests.length} testes passaram!`);
        } else {
          toast.error(`${failed} teste(s) falharam de ${selectedTests.length} executados`);
        }

        return prev;
      });

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

  const handleStop = async () => {
    const stopped = await electronService.stopTestExecution();
    if (stopped) {
      setIsExecuting(false);
      setExecutionResults(prev => {
        const updatedResults = [...prev];
        for (let i = 0; i < updatedResults.length; i++) {
          if (updatedResults[i].status === 'pending' || updatedResults[i].status === 'running') {
            updatedResults[i] = {
              ...updatedResults[i],
              status: 'failed',
              error: 'Execução cancelada pelo usuário'
            };
          }
        }
        return updatedResults;
      });
      setRowStatuses(prev => prev.map(row =>
        row.status === 'running' || row.status === 'pending'
          ? { ...row, status: 'failed', currentStep: 'Cancelado' }
          : row
      ));
      toast.warning('Execução interrompida pelo usuário.');
    } else {
      toast.error('Não foi possível interromper a execução');
    }
  };

  const handleOpenReport = (reportUrl: string) => {
    if (!reportUrl) return;
    if (isElectronMode) {
      electronService.openReport(reportUrl);
    } else {
      window.open(reportUrl, '_blank');
    }
  };

  const handleOpenAllReports = () => {
    executionResults
      .filter(result => result.reportUrl)
      .forEach(result => {
        if (result.reportUrl) {
          handleOpenReport(result.reportUrl);
        }
      });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'passed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-gray-400" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const min = Math.floor(ms / 60000);
    const sec = Math.round((ms % 60000) / 1000);
    return `${min}m ${sec}s`;
  };

  const getRowStatusBg = (status: string) => {
    switch (status) {
      case 'running': return 'bg-blue-50 border-blue-200';
      case 'passed': return 'bg-green-50 border-green-200';
      case 'failed': return 'bg-red-50 border-red-200';
      default: return 'bg-slate-50 border-slate-200';
    }
  };

  const totalDuration = executionResults
    .filter(r => r.duration)
    .reduce((sum, r) => sum + (r.duration || 0), 0);

  const completedRows = rowStatuses.filter(r => r.status === 'passed' || r.status === 'failed').length;
  const passedRows = rowStatuses.filter(r => r.status === 'passed').length;
  const failedRows = rowStatuses.filter(r => r.status === 'failed').length;

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
              Modo Electron - Execução real com Maven/Karate
              {projectPath && (
                <div className="text-xs text-slate-600 mt-1">
                  Projeto: {projectPath}
                </div>
              )}
            </span>
          ) : (
            <span className="text-orange-600 font-medium">
              Modo Web - Execução simulada
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

        {/* Progress bar */}
        {(isExecuting || progress > 0) && (
          <div className="space-y-2">
            <Progress value={progress} className="w-full" />
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>{Math.round(progress)}% concluído</span>
              {totalRows > 0 && (
                <span>{completedRows}/{totalRows} linhas CSV</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Row-level Progress (CSV lines) */}
      {rowStatuses.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Progresso por Linha do CSV</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600 font-normal">
                  {completedRows}/{totalRows} concluídas
                </span>
                {passedRows > 0 && (
                  <Badge className="bg-green-100 text-green-700 text-xs">
                    {passedRows} OK
                  </Badge>
                )}
                {failedRows > 0 && (
                  <Badge className="bg-red-100 text-red-700 text-xs">
                    {failedRows} Falha
                  </Badge>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rowStatuses.map((row) => (
              <div
                key={row.index}
                className={`flex items-center gap-3 p-2 rounded border text-sm transition-all ${getRowStatusBg(row.status)}`}
              >
                {getStatusIcon(row.status)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-700">
                      Linha {row.index + 1}
                    </span>
                    <span className="text-xs text-slate-500 truncate">
                      {row.label}
                    </span>
                  </div>
                  {row.currentStep && row.status === 'running' && (
                    <div className="text-xs text-blue-600 mt-0.5 truncate">
                      {row.currentStep}
                    </div>
                  )}
                  {row.status === 'passed' && row.endMessage && (
                    <div className="text-xs text-green-600 mt-0.5 truncate">
                      {row.endMessage}
                    </div>
                  )}
                  {row.status === 'failed' && (
                    <div className="text-xs text-red-600 mt-0.5 truncate">
                      {row.errorMessage
                        ? `Falha em ${row.label} — ${row.errorMessage}`
                        : row.lastStep
                          ? `Falha em ${row.label} — último passo: ${row.lastStep}`
                          : `Falha em ${row.label}`}
                    </div>
                  )}
                  {row.screenshots && row.screenshots.length > 0 && (
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                      <Image className="h-3 w-3" />
                      {row.screenshots.length} screenshot{row.screenshots.length > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {row.duration && (
                    <span className="text-xs text-slate-400">
                      {formatDuration(row.duration)}
                    </span>
                  )}
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      row.status === 'passed' ? 'text-green-700 border-green-300' :
                      row.status === 'failed' ? 'text-red-700 border-red-300' :
                      row.status === 'running' ? 'text-blue-700 border-blue-300' :
                      'text-gray-500'
                    }`}
                  >
                    {row.status === 'running' ? 'Executando' :
                     row.status === 'passed' ? 'Passou' :
                     row.status === 'failed' ? 'Falhou' :
                     'Pendente'}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
                      {result.error === 'Execução cancelada pelo usuário' && (
                        <Badge variant="secondary">Cancelado</Badge>
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
