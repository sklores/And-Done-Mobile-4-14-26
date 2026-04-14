import { create } from "zustand";

export type Role = "owner" | "manager" | "staff";

type AppState = {
  role: Role;
  businessName: string;
  setRole: (r: Role) => void;
  setBusinessName: (n: string) => void;
};

export const useAppStore = create<AppState>((set) => ({
  role: "owner",
  businessName: "GCDC Grilled Cheese Bar",
  setRole: (role) => set({ role }),
  setBusinessName: (businessName) => set({ businessName }),
}));
