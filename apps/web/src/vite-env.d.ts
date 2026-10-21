interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DEV_TOKEN?: string;
  readonly VITE_AUTH_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Catalogues Lingui compilés à la volée par `@lingui/vite-plugin`. */
declare module '*.po' {
  export const messages: Record<string, string>;
}
