import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ConnectionConfig, ConnectionInput } from '../shared/types';

const STORAGE_FILE_NAME = 'connections.json';

interface ConnectionStoreShape {
  connections: ConnectionConfig[];
}

function getStoragePath(): string {
  return path.join(app.getPath('userData'), STORAGE_FILE_NAME);
}

async function ensureStoreFile(): Promise<string> {
  const filePath = getStoragePath();
  await mkdir(path.dirname(filePath), { recursive: true });

  try {
    await readFile(filePath, 'utf-8');
  } catch {
    const initialData: ConnectionStoreShape = { connections: [] };
    await writeFile(filePath, JSON.stringify(initialData, null, 2), 'utf-8');
  }

  return filePath;
}

async function readStore(): Promise<ConnectionStoreShape> {
  const filePath = await ensureStoreFile();
  const raw = await readFile(filePath, 'utf-8');

  try {
    const parsed = JSON.parse(raw) as ConnectionStoreShape;
    return {
      connections: Array.isArray(parsed.connections) ? parsed.connections : []
    };
  } catch {
    return { connections: [] };
  }
}

async function writeStore(store: ConnectionStoreShape): Promise<void> {
  const filePath = await ensureStoreFile();
  await writeFile(filePath, JSON.stringify(store, null, 2), 'utf-8');
}

function sanitizeConnectionInput(input: ConnectionInput): ConnectionInput {
  return {
    id: input.id,
    name: input.name.trim(),
    nodeUrl: input.nodeUrl.trim(),
    username: input.username?.trim() ?? '',
    password: input.password ?? '',
    skipTlsVerify: Boolean(input.skipTlsVerify)
  };
}

export async function listConnections(): Promise<ConnectionConfig[]> {
  const store = await readStore();
  return store.connections.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

export async function upsertConnection(input: ConnectionInput): Promise<ConnectionConfig[]> {
  const sanitized = sanitizeConnectionInput(input);

  if (!sanitized.name) {
    throw new Error('连接名称不能为空');
  }

  if (!sanitized.nodeUrl) {
    throw new Error('Elasticsearch 地址不能为空');
  }

  const store = await readStore();
  const now = new Date().toISOString();
  const nextConnection: ConnectionConfig = {
    id: sanitized.id ?? randomUUID(),
    name: sanitized.name,
    nodeUrl: sanitized.nodeUrl,
    username: sanitized.username || undefined,
    password: sanitized.password || undefined,
    skipTlsVerify: sanitized.skipTlsVerify || undefined,
    createdAt: now,
    updatedAt: now
  };

  const existingIndex = store.connections.findIndex((item) => item.id === nextConnection.id);

  if (existingIndex >= 0) {
    nextConnection.createdAt = store.connections[existingIndex].createdAt;
    store.connections[existingIndex] = nextConnection;
  } else {
    store.connections.push(nextConnection);
  }

  await writeStore(store);
  return listConnections();
}

export async function removeConnection(id: string): Promise<ConnectionConfig[]> {
  const store = await readStore();
  store.connections = store.connections.filter((item) => item.id !== id);
  await writeStore(store);
  return listConnections();
}

export async function getConnectionById(id: string): Promise<ConnectionConfig> {
  const store = await readStore();
  const connection = store.connections.find((item) => item.id === id);

  if (!connection) {
    throw new Error('未找到对应的连接配置');
  }

  return connection;
}
