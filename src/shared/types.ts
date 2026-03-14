export type QueryMode = 'keyword' | 'dsl';
export type FilterOperator = 'contains' | 'eq' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'not_exists';
export type IndexFieldFilterScope = 'standard' | 'nested';
export type FilterJoinMode = 'and' | 'or';

export interface QueryFilter {
  id: string;
  field: string;
  operator: FilterOperator;
  value?: string;
}

export interface ConnectionConfig {
  id: string;
  name: string;
  nodeUrl: string;
  username?: string;
  password?: string;
  skipTlsVerify?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionInput {
  id?: string;
  name: string;
  nodeUrl: string;
  username?: string;
  password?: string;
  skipTlsVerify?: boolean;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  version?: string;
  clusterName?: string;
}

export interface IndexSummary {
  name: string;
  docCount?: number;
  health?: string;
  status?: string;
}

export interface IndexFieldOption {
  name: string;
  type: string;
  format?: string;
  filterScope?: IndexFieldFilterScope;
}

export interface IndexMetadataResult {
  index: string;
  settings: Record<string, unknown>;
  mappings: Record<string, unknown>;
}

export interface SearchRequestPayload {
  connectionId: string;
  index: string;
  mode: 'keyword';
  keyword?: string;
  size?: number;
  from?: number;
  filters?: QueryFilter[];
  filterJoinMode?: FilterJoinMode;
}

export interface ExecuteDslRequestPayload {
  connectionId: string;
  method: string;
  path: string;
  bodyText?: string;
}

export type PrimitiveValue = string | number | boolean | null;

export interface EsDocument {
  _id: string;
  _index: string;
  _source: Record<string, unknown>;
}

export interface SearchDocumentsResult {
  documents: EsDocument[];
  total: number;
}

export interface ExecuteDslResult {
  statusCode: number;
  responseBody: string;
}

export interface UpdateDocumentPayload {
  connectionId: string;
  index: string;
  id: string;
  changes: Record<string, PrimitiveValue>;
}

export interface CreateDocumentPayload {
  connectionId: string;
  index: string;
  id?: string;
  document: Record<string, PrimitiveValue>;
}

export interface DeleteDocumentPayload {
  connectionId: string;
  index: string;
  id: string;
}

export interface SaveDocumentResult {
  id: string;
  success: boolean;
  message?: string;
}

export interface DeleteDocumentResult {
  id: string;
  success: boolean;
  message?: string;
}

export interface EsApi {
  listConnections: () => Promise<ConnectionConfig[]>;
  saveConnection: (payload: ConnectionInput) => Promise<ConnectionConfig[]>;
  deleteConnection: (id: string) => Promise<ConnectionConfig[]>;
  testConnection: (connectionId: string) => Promise<ConnectionTestResult>;
  getIndices: (connectionId: string) => Promise<IndexSummary[]>;
  getIndexFields: (connectionId: string, index: string) => Promise<IndexFieldOption[]>;
  getIndexMetadata: (connectionId: string, index: string) => Promise<IndexMetadataResult>;
  searchDocuments: (payload: SearchRequestPayload) => Promise<SearchDocumentsResult>;
  executeDslRequest: (payload: ExecuteDslRequestPayload) => Promise<ExecuteDslResult>;
  createDocument: (payload: CreateDocumentPayload) => Promise<SaveDocumentResult>;
  updateDocument: (payload: UpdateDocumentPayload) => Promise<SaveDocumentResult>;
  deleteDocument: (payload: DeleteDocumentPayload) => Promise<DeleteDocumentResult>;
}
