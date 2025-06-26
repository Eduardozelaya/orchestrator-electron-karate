import { useAuthStore } from "../stores/auth";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from './ui/alert-dialog';
import { toast } from 'sonner';
import { Card } from "./ui/card";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { electronService } from "../services/electronService";

const sistemasFixos = [
  { value: "peoplesoft", label: "PeopleSoft" },
  { value: "bonita", label: "Bonita" },
  // Adicione outros sistemas fixos aqui se necessário
];

export function Login() {
  const navigate = useNavigate();
  const { setUsername, setPassword, setUnidade, hasLoadedProject, setHasLoadedProject, resetAuth } = useAuthStore();
  const [credenciais, setCredenciais] = useState<{ [sistema: string]: { usuario: string; senha: string; unidade: string } }>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState({ usuario: "", senha: "", unidade: "" });
  const [errors, setErrors] = useState({ usuario: "", senha: "", unidade: "" });
  const [sistemasCustom, setSistemasCustom] = useState<{ value: string, label: string }[]>([]);
  const [novoSistema, setNovoSistema] = useState("");
  const isElectronMode = electronService.isElectronMode;
  const [isDeleting, setIsDeleting] = useState(false);
  const [sistemaParaExcluir, setSistemaParaExcluir] = useState<string | null>(null);

  useEffect(() => {
    const creds = JSON.parse(localStorage.getItem("credenciais") || "{}");
    setCredenciais(creds);
    const custom = JSON.parse(localStorage.getItem("sistemasCustom") || "[]");
    setSistemasCustom(custom);
  }, []);

  const validate = () => {
    const newErrors = {
      usuario: form.usuario ? "" : "Usuário é obrigatório",
      senha: form.senha ? "" : "Senha é obrigatório",
      unidade: form.unidade ? "" : "Unidade é obrigatório",
    };
    setErrors(newErrors);
    return Object.values(newErrors).every((error) => error === "");
  };

  const handleEdit = (sistema: string) => {
    setEditando(sistema);
    setForm(credenciais[sistema] || { usuario: "", senha: "", unidade: "" });
    setErrors({ usuario: "", senha: "", unidade: "" });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const novasCreds = { ...credenciais, [editando!]: { ...form } };
    localStorage.setItem("credenciais", JSON.stringify(novasCreds));
    setCredenciais(novasCreds);
    setEditando(null);
  };

  const handleEntrar = (sistema: string) => {
    localStorage.setItem('ultimoSistema', sistema);
    setUsername(credenciais[sistema].usuario);
    setPassword(credenciais[sistema].senha);
    navigate("/main");
  };

  const handleAddSistema = () => {
    const nome = novoSistema.trim();
    if (!nome) return;
    const value = nome.toLowerCase().replace(/\s+/g, '-');
    if (
      sistemasFixos.some(s => s.value === value) ||
      sistemasCustom.some(s => s.value === value)
    ) {
      alert("Sistema já existe!");
      return;
    }
    const novo = { value, label: nome };
    const atualizados = [...sistemasCustom, novo];
    setSistemasCustom(atualizados);
    localStorage.setItem("sistemasCustom", JSON.stringify(atualizados));
    setNovoSistema("");
  };

  const handleDelete = (sistema: string) => {      // Remove do localStorage
      const novasCredenciais = { ...credenciais };
      delete novasCredenciais[sistema];
      localStorage.setItem('credenciais', JSON.stringify(novasCredenciais));
      setCredenciais(novasCredenciais);

      if (!sistemasFixos.some(s => s.value === sistema)) {
        const novosSistemasCustom = sistemasCustom.filter(s => s.value !== sistema);
        setSistemasCustom(novosSistemasCustom);
        localStorage.setItem('sistemasCustom', JSON.stringify(novosSistemasCustom));
      }

      // Se estiver editando este sistema, cancela a edição
      if (editando === sistema) {
        setEditando(null);
      }

      // Reseta o estado de autenticação se o sistema excluído for o último sistema usado
      const ultimoSistema = localStorage.getItem('ultimoSistema');
      if (ultimoSistema === sistema) {
        resetAuth();
        localStorage.removeItem('ultimoSistema');
        localStorage.removeItem('ultimoProjectPath');
      }
  };

  const todosSistemas = [...sistemasFixos, ...sistemasCustom];

  return (
    <div className="min-h-screen bg-[#e6f3ff] flex items-center justify-center p-4">
      <Card className="w-[500px] p-6 bg-white shadow-lg">
        <h1 className="text-2xl font-semibold mb-4 text-[#1a4b8c]">Gerenciar Credenciais</h1>
        
        {isElectronMode && hasLoadedProject && (
          <Button
            onClick={() => navigate('/main')}
            variant="outline"
            className="mb-4"
          >
            Voltar para o Projeto
          </Button>
        )}

        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Novo sistema"
            value={novoSistema}
            onChange={e => setNovoSistema(e.target.value)}
            className="border-gray-300"
          />
          <Button onClick={handleAddSistema}>Adicionar Sistema</Button>
        </div>
        
        {todosSistemas.map((sis) => (
          <div key={sis.value} className="border rounded-lg p-4 mb-2 bg-slate-50">
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium text-[#1a4b8c]">{sis.label}</span>
              <div className="flex gap-2">
                {credenciais[sis.value] ? (
                  <>
                    <Button size="sm" onClick={() => handleEdit(sis.value)}>
                      Editar
                    </Button>
                    <Button 
                      size="sm" 
                      variant="destructive"
                      onClick={() => setSistemaParaExcluir(sis.value)}
                    >
                      Excluir
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={() => handleEdit(sis.value)}>
                    Cadastrar
                  </Button>
                )}
              </div>
            </div>
            {credenciais[sis.value] && editando !== sis.value && (
              <div className="text-sm text-slate-700 space-y-1">
                <p>
                  <strong>Usuário:</strong> {credenciais[sis.value].usuario}
                </p>
                <p>
                  <strong>Senha:</strong> {"•".repeat(credenciais[sis.value].senha.length)}
                </p>
                <Button
                  className="mt-2"
                  size="sm"
                  variant="outline"
                  onClick={() => handleEntrar(sis.value)}
                >
                  Entrar no Projeto
                </Button>
              </div>
            )}
            {editando === sis.value && (
              <form className="space-y-2 mt-2" onSubmit={handleSave}>
                <div>
                  <Label>Unidade</Label>
                  <Input
                    value={form.unidade}
                    onChange={(e) => setForm((f) => ({ ...f, unidade: e.target.value }))}
                    className="border-gray-300"
                  />
                </div>
                <div>
                  <Label>Usuário</Label>
                  <Input
                    value={form.usuario}
                    onChange={(e) => setForm((f) => ({ ...f, usuario: e.target.value }))}
                    className="border-gray-300"
                  />
                  {errors.usuario && <p className="text-red-500 text-sm">{errors.usuario}</p>}
                </div>
                <div>
                  <Label>Senha</Label>
                  <Input
                    type="password"
                    value={form.senha}
                    onChange={(e) => setForm((f) => ({ ...f, senha: e.target.value }))}
                    className="border-gray-300"
                  />
                  {errors.senha && <p className="text-red-500 text-sm">{errors.senha}</p>}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button type="submit">Salvar</Button>
                  <Button type="button" variant="outline" onClick={() => setEditando(null)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            )}
          </div>
        ))}

        <AlertDialog open={!!sistemaParaExcluir} onOpenChange={open => !open && setSistemaParaExcluir(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir o sistema <b>{sistemaParaExcluir}</b>? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                disabled={isDeleting}
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    await handleDelete(sistemaParaExcluir!);
                    toast.success('Sistema excluído com sucesso!');
                  } catch {
                    toast.error('Erro ao excluir o sistema.');
                  } finally {
                    setIsDeleting(false);
                    setSistemaParaExcluir(null);
                  }
                }}
              >
                {isDeleting ? 'Excluindo...' : 'Excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>
    </div>
  );
} 