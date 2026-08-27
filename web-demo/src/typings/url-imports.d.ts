// Vite/Vitest `?url` asset imports resolve at bundle time to the asset URL string.
// This repo does not reference vite/client types, so declare the wildcard here.
declare module "*?url" {
  const url: string;
  export default url;
}
