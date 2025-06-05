
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, FolderOpen, Search } from 'lucide-react';
import { toast } from 'sonner';

interface ProjectUploaderProps {
  onProjectLoad: (path: string) => void;
}

const ProjectUploader: React.FC<ProjectUploaderProps> = ({ onProjectLoad }) => {
  const [projectPath, setProjectPath] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const handlePathSubmit = () => {
    if (!projectPath.trim()) {
      toast.error('Por favor, insira um caminho válido');
      return;
    }
    
    toast.success('Escaneando projeto...');
    onProjectLoad(projectPath);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      // Simular upload de arquivo
      const file = files[0];
      toast.success(`Arquivo ${file.name} carregado com sucesso`);
      onProjectLoad(`/uploaded/${file.name}`);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      toast.success(`Projeto ${file.name} carregado via drag & drop`);
      onProjectLoad(`/dropped/${file.name}`);
    }
  };

  return (
    <Tabs defaultValue="path" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="path" className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4" />
          Caminho do Projeto
        </TabsTrigger>
        <TabsTrigger value="upload" className="flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Upload de Arquivo
        </TabsTrigger>
      </TabsList>

      <TabsContent value="path" className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="project-path">Caminho do Projeto Karate</Label>
          <div className="flex gap-2">
            <Input
              id="project-path"
              placeholder="/caminho/para/projeto/karate"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handlePathSubmit()}
            />
            <Button onClick={handlePathSubmit} className="bg-blue-600 hover:bg-blue-700">
              <Search className="h-4 w-4 mr-2" />
              Escanear
            </Button>
          </div>
        </div>
        <p className="text-sm text-slate-600">
          Insira o caminho completo para a pasta raiz do seu projeto Karate
        </p>
      </TabsContent>

      <TabsContent value="upload" className="space-y-4">
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${
            isDragOver 
              ? 'border-blue-500 bg-blue-50' 
              : 'border-slate-300 hover:border-blue-400'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <Upload className="h-12 w-12 mx-auto text-slate-400 mb-4" />
          <p className="text-lg font-medium text-slate-700 mb-2">
            Arraste e solte o projeto aqui
          </p>
          <p className="text-sm text-slate-500 mb-4">
            ou clique para selecionar arquivos
          </p>
          <Input
            type="file"
            onChange={handleFileUpload}
            accept=".zip,.tar,.tar.gz"
            className="hidden"
            id="file-upload"
          />
          <Button asChild variant="outline" className="border-blue-300 text-blue-600 hover:bg-blue-50">
            <label htmlFor="file-upload" className="cursor-pointer">
              Selecionar Arquivo
            </label>
          </Button>
        </div>
        <p className="text-sm text-slate-600">
          Suporte para arquivos .zip, .tar, .tar.gz contendo projetos Karate
        </p>
      </TabsContent>
    </Tabs>
  );
};

export default ProjectUploader;
