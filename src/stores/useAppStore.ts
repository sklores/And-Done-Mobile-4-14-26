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
  // A constant, not a read: no seed view returns the organization's name yet,
  // and setBusinessName has no caller. It is right only for GCDC -- any other
  // tenant's phone would show this name over that tenant's money. The fix is a
  // name on the snapshot payload, not a better default here.
  businessName: "GCDC Grilled Cheese Bar",
  setRole: (role) => set({ role }),
  setBusinessName: (businessName) => set({ businessName }),
}));
