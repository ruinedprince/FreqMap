import { create } from 'zustand'

type AppState = {
  fileHandle?: File
  setFile: (f?: File) => void
}

export const useAppStore = create<AppState>((set) => ({
  setFile: (f) => set({ fileHandle: f }),
}))


