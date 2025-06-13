import React, { useRef, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Check, X, FileText, FolderOpen, File, Upload, Download, Trash2 } from 'lucide-react';
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
  descriptionFiles?: string[];
}

interface TestSelectorProps {
  tests: KarateTest[];
  selectedTests: string[];
  onSelectionChange: (testIds: string[]) => void;
  isScanning: boolean;
  onDataFileView?: (testId: string, dataFile: string) => void;
  onRefresh?: () => void;
}

const TestSelector: React.FC<TestSelectorProps> = ({
  tests,
  selectedTests,
  onSelectionChange,
  isScanning,
  onDataFileView,
  onRefresh
}) => {
  const categories = [...new Set(tests.map(test => test.category))];
  const dataFileInputRef = useRef<{ [key: string]: HTMLInputElement }>({});
  const descFileInputRef = useRef<{ [key: string]: HTMLInputElement }>({});
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  const handleTestToggle = (testId: string) => {
    const newSelection = selectedTests.includes(testId)
      ? selectedTests.filter(id => id !== testId)
      : [...selectedTests, testId];
    onSelectionChange(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedTests.length === tests.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(tests.map(test => test.id));
    }
  };

  const handleCategoryToggle = (category: string) => {
    const categoryTests = tests.filter(test => test.category === category);
    const categoryTestIds = categoryTests.map(test => test.id);
    const allSelected = categoryTestIds.every(id => selectedTests.includes(id));

    if (allSelected) {
      onSelectionChange(selectedTests.filter(id => !categoryTestIds.includes(id)));
    } else {
      const newSelection = [...new Set([...selectedTests, ...categoryTestIds])];
      onSelectionChange(newSelection);
    }
  };

  const getCategoryDisplayName = (category: string) => {
    switch (category) {
      case 'clienteExistente':
        return 'Cliente Existente';
      case 'clientePotencial':
        return 'Cliente Potencial';
      default:
        return category;
    }
  };

  const formatCSVContent = (content: string): string => {
    try {
      // Divide o conteúdo em linhas e remove linhas vazias
      const lines = content.split('\n').filter(line => line.trim());
      
      // Para cada linha, divide por vírgula e limpa os espaços em branco
      const formattedLines = lines.map(line => 
        line.split(',')
          .map(cell => cell.trim())
          .join(',')
      );

      // Junta todas as linhas com quebra de linha
      return formattedLines.join('\n');
    } catch (error) {
      console.error('Erro ao formatar CSV:', error);
      return content;
    }
  };

  const handleFileUpload = async (testId: string, file: File, type: 'data' | 'description') => {
    try {
      const test = tests.find(t => t.id === testId);
      if (!test) return;

      // Encontra o arquivo existente com a mesma extensão
      const existingFiles = type === 'data' ? test.dataFiles : test.descriptionFiles;
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      const existingFile = existingFiles?.find(f => f.toLowerCase().endsWith(`.${fileExtension}`));

      let targetPath;
      if (existingFile) {
        // Se existe um arquivo com a mesma extensão, vamos usar seu nome
        targetPath = existingFile;
        console.log('📂 Atualizando arquivo existente:', existingFile);
      } else {
        // Se não encontrou, usa o nome original do arquivo que está sendo feito upload
        const scenarioPath = test.path.split('/karateTests')[0];
        const folderPath = type === 'data' ? 'data' : 'description';
        targetPath = `${scenarioPath}/karateTests/${folderPath}/${file.name}`;
        console.log('📂 Criando novo arquivo:', targetPath);
      }

      // Lê o conteúdo do arquivo enviado
      const fileContent = await file.text();
      
      // Formata o conteúdo se for um arquivo CSV
      const isCSV = file.name.toLowerCase().endsWith('.csv');
      const formattedContent = isCSV ? formatCSVContent(fileContent) : fileContent;

      console.log('📂 Salvando arquivo em:', targetPath);
      console.log('📂 Conteúdo formatado:', formattedContent);

      if (existingFile) {
        // Se estamos atualizando um arquivo existente, vamos usar o caminho dele
        await electronService.saveCsvFile({
          path: existingFile,
          content: formattedContent
        });
      } else {
        // Se é um novo arquivo, usamos o novo caminho
        await electronService.saveCsvFile({
          path: targetPath,
          content: formattedContent
        });
      }
      
      // Força uma atualização imediata dos dados
      if (onRefresh) {
        await onRefresh();
      }
      
      toast.success(existingFile ? 'Arquivo atualizado com sucesso!' : 'Novo arquivo criado com sucesso!');
    } catch (error) {
      console.error('Erro ao enviar arquivo:', error);
      toast.error('Erro ao enviar arquivo');
    }
  };

  const handleDownloadFile = async (filePath: string) => {
    try {
      await electronService.downloadFile(filePath);
      toast.success('Download iniciado');
    } catch (error) {
      console.error('Erro ao baixar arquivo:', error);
      toast.error('Erro ao baixar arquivo');
    }
  };

  const handleDeleteFile = async (filePath: string) => {
    try {
      await electronService.deleteFile(filePath);
      toast.success('Arquivo excluído com sucesso');
      setFileToDelete(null);
      onRefresh?.();
    } catch (error) {
      console.error('Erro ao deletar arquivo:', error);
      toast.error('Erro ao excluir arquivo');
    }
  };

  if (isScanning) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-slate-600">Escaneando arquivos .feature...</span>
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-6 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Header Controls */}
        <div className="flex items-center justify-between pb-4 border-b">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            className="flex items-center gap-2"
          >
            {selectedTests.length === tests.length ? (
              <>
                <X className="h-4 w-4" />
                Desmarcar Todos
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Selecionar Todos
              </>
            )}
          </Button>
          <Badge variant="secondary" className="bg-slate-100">
            {selectedTests.length} de {tests.length} selecionados
          </Badge>
        </div>

        {/* Tests by Category */}
        {categories.map((category) => {
          const categoryTests = tests.filter(test => test.category === category);
          const selectedInCategory = categoryTests.filter(test => selectedTests.includes(test.id)).length;

          return (
            <div key={category} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedInCategory === categoryTests.length && categoryTests.length > 0}
                    onCheckedChange={() => handleCategoryToggle(category)}
                    className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                  />
                  <FolderOpen className="h-4 w-4 text-blue-600" />
                  <h3 className="font-semibold text-slate-800">{getCategoryDisplayName(category)}</h3>
                  <Badge variant="outline" className="text-xs">
                    {selectedInCategory}/{categoryTests.length}
                  </Badge>
                </div>
              </div>

              <div className="ml-6 space-y-2">
                {categoryTests.map((test) => (
                  <div
                    key={test.id}
                    className={`p-3 rounded-lg border transition-all hover:shadow-sm ${
                      selectedTests.includes(test.id)
                        ? 'bg-green-50 border-green-200'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedTests.includes(test.id)}
                        onCheckedChange={() => handleTestToggle(test.id)}
                        className="mt-1 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-4 w-4 flex-shrink-0 text-slate-500" />
                            <span className="font-medium text-slate-800 truncate">{test.name}</span>
                          </div>
                          {!test.enabled && (
                            <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700 flex-shrink-0">
                              Desabilitado
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 font-mono truncate break-all" title={test.path}>
                          {test.path}
                        </p>

                        {/* Data Files Section */}
                        <div className="mt-2">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs text-slate-600 truncate">Arquivos de dados:</p>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <input
                                type="file"
                                className="hidden"
                                ref={el => dataFileInputRef.current[test.id] = el!}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleFileUpload(test.id, file, 'data');
                                }}
                                accept=".csv,.json"
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => dataFileInputRef.current[test.id]?.click()}
                              >
                                <Upload className="h-3 w-3 text-slate-500" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {test.dataFiles?.map((dataFile, index) => (
                              <div key={index} className="flex items-center gap-1 max-w-full">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-xs truncate max-w-[200px]"
                                  onClick={() => onDataFileView?.(test.id, dataFile)}
                                  title={dataFile.split('/').pop()}
                                >
                                  <File className="h-3 w-3 mr-1 flex-shrink-0" />
                                  <span className="truncate">{dataFile.split('/').pop()}</span>
                                </Button>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => handleDownloadFile(dataFile)}
                                  >
                                    <Download className="h-3 w-3 text-slate-500" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => setFileToDelete(dataFile)}
                                  >
                                    <Trash2 className="h-3 w-3 text-red-500 hover:text-red-600" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Description Files Section */}
                        <div className="mt-2">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs text-slate-600 truncate">Arquivos de descrição:</p>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <input
                                type="file"
                                className="hidden"
                                ref={el => descFileInputRef.current[test.id] = el!}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleFileUpload(test.id, file, 'description');
                                }}
                                accept=".csv,.json"
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => descFileInputRef.current[test.id]?.click()}
                              >
                                <Upload className="h-3 w-3 text-blue-500" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {test.descriptionFiles?.map((descFile, index) => (
                              <div key={index} className="flex items-center gap-1 max-w-full">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-xs truncate max-w-[200px] bg-blue-50 hover:bg-blue-100"
                                  onClick={() => onDataFileView?.(test.id, descFile)}
                                  title={descFile.split('/').pop()}
                                >
                                  <File className="h-3 w-3 mr-1 flex-shrink-0 text-blue-600" />
                                  <span className="truncate">{descFile.split('/').pop()}</span>
                                </Button>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => handleDownloadFile(descFile)}
                                  >
                                    <Download className="h-3 w-3 text-blue-500" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => setFileToDelete(descFile)}
                                  >
                                    <Trash2 className="h-3 w-3 text-red-500 hover:text-red-600" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {test.scenarios.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {test.scenarios.map((scenario, index) => (
                              <Badge key={index} variant="outline" className="text-xs truncate max-w-[200px]" title={scenario}>
                                {scenario}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {category !== categories[categories.length - 1] && (
                <Separator className="my-4" />
              )}
            </div>
          );
        })}

        {tests.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum teste encontrado</p>
            <p className="text-sm">Verifique se o projeto Karate está configurado corretamente</p>
          </div>
        )}
      </div>

      <AlertDialog open={!!fileToDelete} onOpenChange={(open) => !open && setFileToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este arquivo?
              <div className="mt-2 p-2 bg-slate-100 rounded text-sm font-mono">
                {fileToDelete?.split('/').pop()}
              </div>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => fileToDelete && handleDeleteFile(fileToDelete)}
              className="bg-red-600 hover:bg-red-700"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default TestSelector;
