import { create } from "zustand";
import { persist } from "zustand/middleware";

// Interface para o estado que será persistido
interface AuthPersistState {
    username: string;
    password: string;
    unidade: string;
}

// Interface para o estado completo (persistido + temporário)
interface AuthState extends AuthPersistState {
    hasLoadedProject: boolean;
    ultimoSistema: string | null;
    setUsername: (username: string) => void;
    setPassword: (password: string) => void;
    setUnidade: (unidade: string) => void;
    setHasLoadedProject: (loaded: boolean) => void;
    setUltimoSistema: (sistema: string | null) => void;
    resetAuth: () => void;
}

// Criar store com estado persistente e temporário separados
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // Estado persistente
      username: "",
      password: "",
      unidade: "",
      
      // Estado temporário (não será persistido)
      hasLoadedProject: false,
      ultimoSistema: null,

      // Actions
      setUsername: (username: string) => set({ username }),
      setPassword: (password: string) => set({ password }),
      setUnidade: (unidade: string) => set({ unidade }),
      setHasLoadedProject: (loaded: boolean) => set({ hasLoadedProject: loaded }),
      setUltimoSistema: (sistema: string | null) => set({ ultimoSistema: sistema }),
      resetAuth: () => set({ 
        username: "", 
        password: "", 
        unidade: "", 
        hasLoadedProject: false,
        ultimoSistema: null
      }),
    }),
    {
      name: "auth-storage", // nome da chave no localStorage
      // Especificar apenas os campos que queremos persistir
      partialize: (state) => ({
        username: state.username,
        password: state.password,
        unidade: state.unidade
      })
    }
  )
);