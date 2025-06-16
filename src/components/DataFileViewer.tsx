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
import { File, Save, Lock } from 'lucide-react';
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
  const [header, setHeader] = useState('');
  const [contentWithoutHeader, setContentWithoutHeader] = useState('');
  const [isDataFile, setIsDataFile] = useState(false);

  const fileName = dataFile.split('/').pop() || '';
  const isCSV = fileName.endsWith('.csv');
  const isJSON = fileName.endsWith('.json');
  const isDescriptionFile = dataFile.includes('/description/');

  useEffect(() => {
    if (isOpen && dataFile) {
      loadFileContent();
    }
  }, [isOpen, dataFile, lastUpdate]);

  useEffect(() => {
    if (isCSV && content) {
      const lines = content.split('\n').filter(line => line.trim());
      setHeader(lines[0] || '');
      setContentWithoutHeader(lines.slice(1).join('\n'));
      // Verifica se é um arquivo de dados (não de descrição) e tem dados
      setIsDataFile(!isDescriptionFile && lines.length > 1 && !lines[1].includes(':'));
    }
  }, [content, isCSV, isDescriptionFile]);

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
      let formattedContent;
      
      if (isCSV) {
        if (isDataFile) {
          // Para arquivos de dados, mantém o formato original com vírgulas
          const newContent = contentWithoutHeader.split('\n')
            .filter(line => line.trim())
            .map(line => line.split(',').map(cell => cell.trim()).join(','))
            .join('\n');
          formattedContent = `${header}\n${newContent}`;
        } else {
          // Para arquivos de descrição, usa o formato anterior
          const newContent = isCSV ? `${header}\n${contentWithoutHeader}` : content;
          formattedContent = formatCSVContent(newContent);
        }
      } else {
        formattedContent = content;
      }
      
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
      const lines = content.split('\n').filter(line => line.trim());
      const headers = lines[0]?.split(',').map(cell => cell.trim()) || [];
      const data = lines.slice(1);

      // Verifica se é um arquivo de descrição de campos
      const isFieldDescription = isDescriptionFile || headers.length > 0 && data.some(line => line.includes(':'));

      if (isFieldDescription) {
        // Processa as descrições dos campos
        const descriptions = new Map();
        let currentField = '';
        let currentDescription = '';

        // Processa o conteúdo para extrair as descrições
        data.forEach(line => {
          // Remove aspas extras e espaços
          const cleanLine = line.replace(/^["']|["']$/g, '').trim();
          
          // Verifica se a linha começa com um campo conhecido
          const matchingHeader = headers.find(header => 
            cleanLine.toLowerCase().startsWith(header.toLowerCase() + ':') ||
            cleanLine.toLowerCase().startsWith('"' + header.toLowerCase() + ':') ||
            cleanLine.toLowerCase().startsWith("'" + header.toLowerCase() + ':')
          );

          if (matchingHeader) {
            // Se encontrou um novo campo e já tinha um campo atual, salva o anterior
            if (currentField && currentDescription) {
              descriptions.set(currentField, currentDescription.trim());
            }
            // Começa um novo campo
            currentField = matchingHeader;
            currentDescription = cleanLine.substring(cleanLine.indexOf(':') + 1).trim();
          } else if (currentField) {
            // Continua a descrição do campo atual
            currentDescription += ' ' + cleanLine;
          }
        });

        // Salva o último campo
        if (currentField && currentDescription) {
          descriptions.set(currentField, currentDescription.trim());
        }

        // Renderiza a tabela com as descrições processadas
        return (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-slate-100 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-slate-700 border-b border-slate-200 min-w-[150px]">
                    Campo
                  </th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-slate-700 border-b border-slate-200">
                    Descrição
                  </th>
                </tr>
              </thead>
              <tbody>
                {headers.map((header, index) => {
                  const description = descriptions.get(header) || '';
                  return (
                    <tr key={index} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm border-b border-slate-200 font-medium text-slate-700 whitespace-nowrap">
                        {header}
                      </td>
                      <td className="px-4 py-3 text-sm border-b border-slate-200 text-slate-600">
                        {description}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      }

      // Formatação padrão para CSVs normais
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-slate-100 sticky top-0">
              <tr>
                {headers.map((header, index) => (
                  <th 
                    key={index} 
                    className="px-4 py-2 text-left text-sm font-medium text-slate-700 border-b border-slate-200 min-w-[150px]"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((line, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-slate-50">
                  {line.split(',').map((cell, cellIndex) => (
                    <td 
                      key={cellIndex} 
                      className="px-4 py-2 text-sm border-b border-slate-200"
                    >
                      {cell.trim()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    } else if (isJSON) {
      try {
        const parsed = JSON.parse(content);
        return (
          <pre className="font-mono text-sm whitespace-pre-wrap bg-slate-50 p-4 rounded-lg">
            {JSON.stringify(parsed, null, 2)}
          </pre>
        );
      } catch {
        return <pre className="font-mono text-sm whitespace-pre-wrap bg-slate-50 p-4 rounded-lg">{content}</pre>;
      }
    }
    return <pre className="font-mono text-sm whitespace-pre-wrap bg-slate-50 p-4 rounded-lg">{content}</pre>;
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-4xl overflow-y-auto">
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
            <>
              {/* Preview em cima */}
              <div className="border rounded-lg p-4 bg-white">
                <p className="text-sm font-medium text-slate-700 mb-2">Visualização formatada:</p>
                <div className="max-h-[300px] overflow-y-auto">
                  {formatContent()}
                </div>
              </div>

              {/* Editor embaixo */}
              <div className="border rounded-lg p-4 bg-white">
                <p className="text-sm font-medium text-slate-700 mb-2">Editor:</p>
                {isCSV ? (
                  <div className="space-y-2">
                    {/* Cabeçalho travado */}
                    <div className="relative">
                      <Textarea
                        value={header}
                        className="font-mono text-sm bg-slate-50 min-h-[40px] resize-none"
                        readOnly
                      />
                    </div>
                    {/* Conteúdo editável */}
                    <Textarea
                      value={contentWithoutHeader}
                      onChange={(e) => {
                        const newContent = e.target.value;
                        setContentWithoutHeader(newContent);
                        // Atualiza o content completo para manter a consistência
                        setContent(`${header}\n${newContent}`);
                      }}
                      className="font-mono text-sm min-h-[150px]"
                      readOnly={isDescriptionFile}
                      placeholder={isDataFile ? "Digite os dados separados por vírgula..." : "Digite o conteúdo do arquivo aqui..."}
                    />
                  </div>
                ) : (
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="font-mono text-sm min-h-[200px]"
                    readOnly={isDescriptionFile}
                    placeholder="Digite o conteúdo do arquivo aqui..."
                  />
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default DataFileViewer;
