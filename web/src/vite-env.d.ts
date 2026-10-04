// adapted from lakshyamody/dbmsproj (landing)
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DASHBOARD_URL?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
