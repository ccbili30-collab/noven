import type { CreatXDesktopApi } from "@creatx/contracts"

declare global {
  interface Window {
    creatx: CreatXDesktopApi
  }
}

export {}
