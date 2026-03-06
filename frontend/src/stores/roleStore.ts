import { create } from "zustand";

interface RoleStore {
  company: string;
  roleId: string;
  role: string;
  description: string;
  link: string;
  hourly_range: number[] | null;
  cover_letter: string | null;
  locations: string[] | null;
  resumeTex: string;
  resumePdf: string;
  setCompany: (company: string) => void;
  setRoleId: (roleId: string) => void;
  setRole: (role: string) => void;
  setDescription: (description: string) => void;
  setLink: (link: string) => void;
  setHourlyRange: (hourly_range: number[] | null) => void;
  setCoverLetter: (cover_letter: string | null) => void;
  setLocations: (locations: string[] | null) => void;
  setResumeTex: (resumeTex: string) => void;
  setResumePdf: (resumePdf: string) => void;
}

const useRoleStore = create<RoleStore>((set) => ({
  company: "",
  roleId: "",
  resumeTex: "",
  resumePdf: "",
  role: "",
  description: "",
  link: "",
  hourly_range: null,
  cover_letter: null,
  locations: null,
  setCompany: (company: string) => set({ company }),
  setRoleId: (roleId: string) => set({ roleId }),
  setResumeTex: (resumeTex: string) => set({ resumeTex }),
  setResumePdf: (resumePdf: string) => set({ resumePdf }),
  setRole: (role: string) => set({ role }),
  setDescription: (description: string) => set({ description }),
  setLink: (link: string) => set({ link }),
  setHourlyRange: (hourly_range: number[] | null) => set({ hourly_range }),
  setCoverLetter: (cover_letter: string | null) => set({ cover_letter }),
  setLocations: (locations: string[] | null) => set({ locations }),
}));

export default useRoleStore;