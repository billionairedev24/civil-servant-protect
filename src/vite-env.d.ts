/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Where the API lives. Unset means the apps read fixtures, which is how the
   * demo runs on a laptop with nothing installed and how the design gets
   * reviewed without Postgres.
   */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
