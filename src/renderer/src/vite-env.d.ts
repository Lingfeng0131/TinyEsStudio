/// <reference types="vite/client" />

import type { EsApi } from '../../shared/types';

declare global {
  interface Window {
    esApi: EsApi;
  }
}

export {};
