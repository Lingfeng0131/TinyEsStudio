import { contextBridge, ipcRenderer } from 'electron';
import type { EsApi } from '../shared/types';

const api: EsApi = {
  listConnections: () => ipcRenderer.invoke('connections:list'),
  saveConnection: (payload) => ipcRenderer.invoke('connections:save', payload),
  deleteConnection: (id) => ipcRenderer.invoke('connections:delete', id),
  testConnection: (connectionId) => ipcRenderer.invoke('connections:test', connectionId),
  getIndices: (connectionId) => ipcRenderer.invoke('indices:list', connectionId),
  getIndexFields: (connectionId, index) => ipcRenderer.invoke('indices:fields', connectionId, index),
  getIndexMetadata: (connectionId, index) => ipcRenderer.invoke('indices:metadata', connectionId, index),
  searchDocuments: (payload) => ipcRenderer.invoke('documents:search', payload),
  executeDslRequest: (payload) => ipcRenderer.invoke('dsl:execute', payload),
  createDocument: (payload) => ipcRenderer.invoke('documents:create', payload),
  updateDocument: (payload) => ipcRenderer.invoke('documents:update', payload),
  deleteDocument: (payload) => ipcRenderer.invoke('documents:delete', payload)
};

contextBridge.exposeInMainWorld('esApi', api);
