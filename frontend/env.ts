export const ENV_ID: string = __DEV__ ? "dev-local" : "prod";

// Namespaced storage key helper
export const storageKey = (key: string) => `${ENV_ID}:${key}`;
