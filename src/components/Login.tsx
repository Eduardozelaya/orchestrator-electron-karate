import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "./ui/card";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Button } from "./ui/button";

export function Login() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    unidade: "",
    sistema: "",
    usuario: "",
    senha: ""
  });

  const [errors, setErrors] = useState({
    unidade: "",
    sistema: "",
    usuario: "",
    senha: ""
  });

  const validate = () => {
    const newErrors = {
        unidade: formData.unidade ? "" : "Unidade é obrigatório",
        sistema: formData.sistema ? "" : "Sistema é obrigatório",
        usuario: formData.usuario ? "" : "Usuário é obrigatório",
        senha: formData.senha ? "" : "Senha é obrigatório",
    };

    setErrors(newErrors);
    return Object.values(newErrors).every(error => error === "");
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Por enquanto apenas redireciona para a tela principal
    if (validate()) {
      navigate("/main");
    }
  };

  return (
    <div className="min-h-screen bg-[#e6f3ff] flex items-center justify-center p-4">
      <Card className="w-[500px] p-6 bg-white shadow-lg">
        <h1 className="text-2xl font-semibold mb-6 text-[#1a4b8c]">Karate - Página Inicial</h1>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="unidade" className="text-[#1a4b8c] font-medium">Unidade</Label>
            <Select
              value={formData.unidade}
              onValueChange={(value) => setFormData({ ...formData, unidade: value })}
            >
              <SelectTrigger className="border-gray-300">
                <SelectValue placeholder="Selecione a unidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="xyz">XYZ</SelectItem>
              </SelectContent>
            </Select>
            {errors.unidade && <p className="text-red-500 text-sm">{errors.unidade}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="sistema" className="text-[#1a4b8c] font-medium">Sistema</Label>
            <Select
              value={formData.sistema}
              onValueChange={(value) => setFormData({ ...formData, sistema: value })}
            >
              <SelectTrigger className="border-gray-300">
                <SelectValue placeholder="Selecione o sistema" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="peoplesoft">PeopleSoft</SelectItem>
                <SelectItem value="bonita">Bonita</SelectItem>
              </SelectContent>
            </Select>
            {errors.sistema && <p className="text-red-500 text-sm">{errors.sistema}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="usuario" className="text-[#1a4b8c] font-medium">Usuário</Label>
            <Input
              id="usuario"
              value={formData.usuario}
              onChange={(e) => setFormData({ ...formData, usuario: e.target.value })}
              className="border-gray-300"
            />
            {errors.usuario && <p className="text-red-500 text-sm">{errors.usuario}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="senha" className="text-[#1a4b8c] font-medium">Senha</Label>
            <Input
              id="senha"
              type="password"
              value={formData.senha}
              onChange={(e) => setFormData({ ...formData, senha: e.target.value })}
              className="border-gray-300"
            />
            {errors.senha && <p className="text-red-500 text-sm">{errors.senha}</p>}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="submit"
              className="bg-[#1a4b8c] hover:bg-[#153d73] text-white"
            >
              Entrar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
} 