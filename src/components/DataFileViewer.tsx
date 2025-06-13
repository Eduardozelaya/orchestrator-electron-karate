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
import { File, Save } from 'lucide-react';
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
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const fileName = dataFile.split('/').pop() || '';
  const isCSV = fileName.endsWith('.csv');
  const isJSON = fileName.endsWith('.json');
  const isDescriptionFile = dataFile.includes('/description/');

  useEffect(() => {
    if (isOpen && dataFile) {
      loadFileContent();
    }
  }, [isOpen, dataFile, lastUpdate]);

  const loadFileContent = async () => {
    setIsLoading(true);
    try {
      console.log('📂 Lendo conteúdo de:', dataFile);
      if (!dataFile) {
        throw new Error('Caminho do arquivo de dados não fornecido');
      }
      const fileContent = await electronService.readFileContent(dataFile);
      setContent(fileContent);
      setOriginalContent(fileContent);
    } catch (error) {
      toast.error('Erro ao carregar arquivo');
      console.error('❌ Erro ao carregar arquivo:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCSVContent = (content: string): string => {
    if (!isCSV) return content;

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

  const handleSave = async () => {
    if (isDescriptionFile) return;
    
    setIsSaving(true);
    try {
      // Formata o conteúdo antes de salvar
      const formattedContent = formatCSVContent(content);
      
      console.log('📂 Salvando arquivo em:', dataFile);
      console.log('📂 Conteúdo formatado:', formattedContent);

      await electronService.saveCsvFile({
        path: dataFile,
        content: formattedContent
      });
      
      setOriginalContent(formattedContent);
      setContent(formattedContent);
      setLastUpdate(Date.now());
      toast.success('Arquivo salvo com sucesso!');
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
      return content.split('\n').map((line, index) => (
        <div key={index} className="font-mono text-sm border-b border-slate-200 py-1">
          {line.split(',').map((cell, cellIndex) => (
            <span key={cellIndex} className="inline-block min-w-[100px] px-2 border-r border-slate-200">
              {cell}
            </span>
          ))}
        </div>
      ));
    } else if (isJSON) {
      try {
        const parsed = JSON.parse(content);
        return (
          <pre className="font-mono text-sm whitespace-pre-wrap">
            {JSON.stringify(parsed, null, 2)}
          </pre>
        );
      } catch {
        return <pre className="font-mono text-sm whitespace-pre-wrap">{content}</pre>;
      }
    }
    return <pre className="font-mono text-sm whitespace-pre-wrap">{content}</pre>;
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
              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
              >
                {isSaving ? (
                  <>
                    <Skeleton className="h-4 w-4 mr-2" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Salvar Alterações
                  </>
                )}
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : (
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="font-mono text-sm min-h-[300px]"
              readOnly={isDescriptionFile}
            />
          )}

          {!isLoading && (content || isDescriptionFile) && (
            <div className="border rounded-lg p-4 bg-slate-50">
              <p className="text-sm font-medium text-slate-700 mb-2">Visualização formatada:</p>
              <div className="overflow-x-auto">
                {formatContent()}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default DataFileViewer;
