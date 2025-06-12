import React, { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { File, Save, X } from 'lucide-react';
import { electronService } from '@/services/electronService';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

interface DataFileViewerProps {
  isOpen: boolean;
  onClose: () => void;
  testId: string;
  dataFile: string;
}

const DataFileViewer: React.FC<DataFileViewerProps> = ({
  isOpen,
  onClose,
  testId,
  dataFile
}) => {
  const [header, setHeader] = useState('');
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fileName = dataFile.split('/').pop() || '';
  const isCSV = fileName.endsWith('.csv');
  const isJSON = fileName.endsWith('.json');
  const isDescriptionFile = dataFile.includes('/description/');

  useEffect(() => {
    if (isOpen && dataFile) {
      loadFileContent();
    }
  }, [isOpen, dataFile]);

  const loadFileContent = async () => {
    setIsLoading(true);
    try {
      console.log('📂 Lendo conteúdo de:', dataFile);
      if (!dataFile) {
        throw new Error('Caminho do arquivo de dados não fornecido');
      }
      const fileContent = await electronService.readFileContent(dataFile);
      
      // Separa o cabeçalho do conteúdo
      const lines = fileContent.split('\n');
      const headerLine = lines[0] || '';
      const contentLines = lines.slice(1).join('\n');
      
      setHeader(headerLine);
      setContent(contentLines);
      setOriginalContent(contentLines);
    } catch (error) {
      toast.error('Erro ao carregar arquivo');
      console.error('❌ Erro ao carregar arquivo:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (isDescriptionFile) return; // Não permite salvar arquivos de descrição
    
    setIsSaving(true);
    try {
      // Combina o cabeçalho com o conteúdo editado
      const fullContent = `${header}\n${content}`;
      await electronService.saveCsvFile(dataFile, fullContent);
      setOriginalContent(content);
      toast.success('Arquivo salvo com sucesso!');
      await loadFileContent();
    } catch (error) {
      toast.error('Erro ao salvar arquivo');
      console.error('Erro ao salvar arquivo:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = content !== originalContent && !isDescriptionFile;

  const formatContent = () => {
    if (isCSV) {
      // Formatação para CSV com cabeçalho destacado
      return (
        <div className="space-y-1">
          {/* Cabeçalho */}
          <div className="font-mono text-sm border-b-2 border-slate-300 py-1 bg-slate-50 overflow-x-auto whitespace-nowrap">
            {header.split(',').map((cell, cellIndex) => (
              <span key={cellIndex} className="inline-block min-w-[100px] px-2 border-r border-slate-200 font-semibold">
                {cell}
              </span>
            ))}
          </div>
          {/* Conteúdo */}
          {content.split('\n').map((line, index) => (
            <div key={index} className="font-mono text-sm border-b border-slate-200 py-1 overflow-x-auto whitespace-nowrap">
              {line.split(',').map((cell, cellIndex) => (
                <span key={cellIndex} className="inline-block min-w-[100px] px-2 border-r border-slate-200">
                  {cell}
                </span>
              ))}
            </div>
          ))}
        </div>
      );
    } else if (isJSON) {
      try {
        const parsed = JSON.parse(header + '\n' + content);
        return (
          <pre className="font-mono text-sm whitespace-pre-wrap">
            {JSON.stringify(parsed, null, 2)}
          </pre>
        );
      } catch {
        return <pre className="font-mono text-sm whitespace-pre-wrap">{header + '\n' + content}</pre>;
      }
    }
    return <pre className="font-mono text-sm whitespace-pre-wrap">{header + '\n' + content}</pre>;
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-4xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <File className="h-5 w-5" />
            {fileName}
            {isDescriptionFile && (
              <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                Arquivo de Descrição
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            {isDescriptionFile ? 'Visualização da descrição do teste' : `Arquivo de dados do teste ${testId}`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {isCSV ? 'CSV' : isJSON ? 'JSON' : 'Texto'}
              </Badge>
              {hasChanges && (
                <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                  Modificado
                </Badge>
              )}
            </div>
            {!isDescriptionFile && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setContent(originalContent);
                    toast.info('Alterações descartadas');
                  }}
                  disabled={!hasChanges}
                >
                  <X className="h-4 w-4 mr-1" />
                  Descartar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!hasChanges || isSaving}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Save className="h-4 w-4 mr-1" />
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Preview Section */}
              <div>
                <h4 className="text-sm font-medium text-slate-700 mb-2">
                  {isDescriptionFile ? 'Conteúdo da Descrição:' : 'Preview:'}
                </h4>
                <div className={`border rounded-lg p-4 overflow-auto max-h-[30vh] ${
                  isDescriptionFile ? 'bg-slate-50' : 'bg-white'
                }`}>
                  {formatContent()}
                </div>
              </div>

              {/* Edit Section - Only for data files */}
              {!isDescriptionFile && (
                <div>
                  <h4 className="text-sm font-medium text-slate-700 mb-2">Editar:</h4>
                  <div className="border rounded-lg bg-white space-y-2">
                    {/* Cabeçalho não editável */}
                    <div className="p-2 bg-slate-50 border-b overflow-x-auto">
                      <div className="font-mono text-sm text-slate-600 whitespace-nowrap">
                        {header}
                      </div>
                    </div>
                    {/* Conteúdo editável */}
                    <Textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="font-mono text-sm w-full min-h-[200px] border-none focus-visible:ring-0"
                      placeholder="Edite o conteúdo aqui..."
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default DataFileViewer;
