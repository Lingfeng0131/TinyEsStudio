import { ipcMain } from 'electron';
import type { ConnectionInput, SearchRequestPayload, UpdateDocumentPayload } from '../shared/types';
import { fetchIndexFields, fetchIndices, searchDocuments, testEsConnection, updateDocument } from './elasticsearch';
import { getConnectionById, listConnections, removeConnection, upsertConnection } from './storage';

export function registerIpcHandlers(): void {
  ipcMain.handle('connections:list', async () => listConnections());

  ipcMain.handle('connections:save', async (_, payload: ConnectionInput) => upsertConnection(payload));

  ipcMain.handle('connections:delete', async (_, id: string) => removeConnection(id));

  ipcMain.handle('connections:test', async (_, connectionId: string) => {
    const connection = await getConnectionById(connectionId);
    return testEsConnection(connection);
  });

  ipcMain.handle('indices:list', async (_, connectionId: string) => {
    const connection = await getConnectionById(connectionId);
    return fetchIndices(connection);
  });

  ipcMain.handle('indices:fields', async (_, connectionId: string, index: string) => {
    const connection = await getConnectionById(connectionId);
    return fetchIndexFields(connection, index);
  });

  ipcMain.handle('documents:search', async (_, payload: SearchRequestPayload) => {
    const connection = await getConnectionById(payload.connectionId);
    return searchDocuments(connection, payload);
  });

  ipcMain.handle('documents:update', async (_, payload: UpdateDocumentPayload) => {
    const connection = await getConnectionById(payload.connectionId);
    return updateDocument(connection, payload.index, payload.id, payload.changes);
  });
}
