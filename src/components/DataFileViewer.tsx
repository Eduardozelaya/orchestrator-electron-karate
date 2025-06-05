
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

  const fileName = dataFile.split('/').pop() || '';
  const isCSV = fileName.endsWith('.csv');
  const isJSON = fileName.endsWith('.json');

  useEffect(() => {
    if (isOpen && dataFile) {
      loadFileContent();
    }
  }, [isOpen, dataFile]);

  const loadFileContent = async () => {
    setIsLoading(true);
    try {
      const fileContent = await electronService.readFileContent(dataFile);
      setContent(fileContent);
      setOriginalContent(fileContent);
    } catch (error) {
      toast.error('Erro ao carregar arquivo');
      console.error('Erro ao carregar arquivo:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await electronService.saveCsvFile(dataFile, content);
      setOriginalContent(content);
      toast.success('Arquivo salvo com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar arquivo');
      console.error('Erro ao salvar arquivo:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = content !== originalContent;

  const formatContent = () => {
    if (isCSV) {
      // Formatação simples para CSV
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
          </SheetTitle>
          <SheetDescription>
            Arquivo de dados do teste {testId}
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
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Preview do conteúdo */}
              <div className="border rounded-lg p-4 bg-slate-50 max-h-64 overflow-auto">
                <h4 className="font-medium mb-2">Preview:</h4>
                {formatContent()}
              </div>

              {/* Editor de texto */}
              <div>
                <h4 className="font-medium mb-2">Editar conteúdo:</h4>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={15}
                  className="font-mono text-sm"
                  placeholder="Conteúdo do arquivo..."
                />
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default DataFileViewer;
