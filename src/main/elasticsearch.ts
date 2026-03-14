import { Client } from '@elastic/elasticsearch';
import type {
  ConnectionConfig,
  ConnectionTestResult,
  DeleteDocumentResult,
  ExecuteDslRequestPayload,
  ExecuteDslResult,
  FilterJoinMode,
  FilterOperator,
  IndexFieldOption,
  IndexMetadataResult,
  IndexSummary,
  PrimitiveValue,
  QueryFilter,
  SaveDocumentResult,
  SearchDocumentsResult,
  SearchRequestPayload
} from '../shared/types';
import { getAllowedFilterOperators } from '../shared/filtering';

function collectFieldMappings(
  properties: Record<string, unknown> | undefined,
  prefix = '',
  filterScope: 'standard' | 'nested' = 'standard'
): IndexFieldOption[] {
  if (!properties) {
    return [];
  }

  const fields: IndexFieldOption[] = [];

  Object.entries(properties).forEach(([key, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return;
    }

    const mapping = value as Record<string, unknown>;
    const fieldName = prefix ? `${prefix}.${key}` : key;
    const fieldType = typeof mapping.type === 'string' ? mapping.type : 'object';
    const nextFilterScope = fieldType === 'nested' ? 'nested' : filterScope;
    const childProperties =
      mapping.properties && typeof mapping.properties === 'object' && !Array.isArray(mapping.properties)
        ? (mapping.properties as Record<string, unknown>)
        : undefined;

    if (childProperties) {
      fields.push(...collectFieldMappings(childProperties, fieldName, nextFilterScope));
      return;
    }

    if (fieldType !== 'object' && fieldType !== 'nested') {
      fields.push({
        name: fieldName,
        type: fieldType,
        format: typeof mapping.format === 'string' ? mapping.format : undefined,
        filterScope
      });
    }
  });

  return fields;
}

function createClient(connection: ConnectionConfig): Client {
  const hasAuth = Boolean(connection.username);
  const isHttps = connection.nodeUrl.trim().toLowerCase().startsWith('https://');

  return new Client({
    node: connection.nodeUrl,
    enableMetaHeader: false,
    auth: hasAuth
      ? {
          username: connection.username ?? '',
          password: connection.password ?? ''
        }
      : undefined,
    tls: isHttps && connection.skipTlsVerify ? { rejectUnauthorized: false } : undefined
  });
}

function formatConnectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : '连接失败';

  if (message.includes('received plaintext http traffic on an https channel')) {
    return '当前 Elasticsearch 开启了 HTTPS，请把地址改成 https:// 开头';
  }

  if (
    message.includes('self-signed certificate') ||
    message.includes('self signed certificate in certificate chain') ||
    message.includes('unable to verify the first certificate')
  ) {
    return 'HTTPS 证书校验失败：当前服务可能使用了自签名或内网证书。请编辑连接，勾选“忽略 HTTPS 证书校验”后再重试。';
  }

  if (message.includes('missing authentication credentials')) {
    return '连接需要认证，请填写用户名和密码后重试';
  }

  return message;
}

function escapeQueryStringValue(value: string): string {
  return value.replace(/([+\-=&|><!(){}\[\]^"~*?:\\/])/g, '\\$1');
}

function normalizeFilterValue(value: string): string | number | boolean {
  const trimmed = value.trim();

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  const asNumber = Number(trimmed);
  if (trimmed !== '' && !Number.isNaN(asNumber)) {
    return asNumber;
  }

  return trimmed;
}

function getFieldOptionMap(fields: IndexFieldOption[]): Record<string, IndexFieldOption> {
  return fields.reduce<Record<string, IndexFieldOption>>((accumulator, field) => {
    accumulator[field.name] = field;
    return accumulator;
  }, {});
}

function getFieldOptionOrThrow(
  fieldOptions: Record<string, IndexFieldOption>,
  fieldName: string
): IndexFieldOption {
  const field = fieldOptions[fieldName];

  if (!field) {
    throw new Error(`字段 ${fieldName} 不存在或暂未加载到当前索引 mapping`);
  }

  return field;
}

function validateFilterOperator(field: IndexFieldOption, operator: FilterOperator): void {
  const allowedOperators = getAllowedFilterOperators(field);

  if (allowedOperators.length === 0) {
    if (field.filterScope === 'nested') {
      throw new Error(`字段 ${field.name} 位于 nested 结构中，当前版本暂不支持条件筛选`);
    }

    throw new Error(`字段 ${field.name}（${field.type}）当前暂不支持条件筛选`);
  }

  if (!allowedOperators.includes(operator)) {
    throw new Error(`字段 ${field.name}（${field.type}）不支持“${operator}”筛选`);
  }
}

function buildKeywordClause(keyword: string): Record<string, unknown> {
  const wildcardQuery = keyword
    .split(/\s+/)
    .filter(Boolean)
    .map((item) => `*${item.replace(/([:\\/])/g, '\\$1')}*`)
    .join(' AND ');

  return {
    bool: {
      should: [
        {
          ids: {
            values: [keyword]
          }
        },
        {
          multi_match: {
            query: keyword,
            fields: ['*'],
            lenient: true
          }
        },
        {
          query_string: {
            query: wildcardQuery,
            fields: ['*'],
            analyze_wildcard: true,
            lenient: true,
            default_operator: 'and'
          }
        }
      ],
      minimum_should_match: 1
    }
  };
}

function buildSingleFilterClause(
  filter: QueryFilter,
  fieldOptions: Record<string, IndexFieldOption>
): Record<string, unknown> | null {
  const field = filter.field.trim();
  if (!field) {
    return null;
  }

  const operator = filter.operator as FilterOperator;
  const rawValue = filter.value?.trim() ?? '';
  const fieldOption = getFieldOptionOrThrow(fieldOptions, field);

  validateFilterOperator(fieldOption, operator);

  if (operator === 'exists' || operator === 'not_exists') {
    if (field === '_id') {
      return operator === 'exists'
        ? {
            match_all: {}
          }
        : {
            match_none: {}
          };
    }

    const existsClause = {
      exists: {
        field
      }
    };

    return operator === 'exists'
      ? existsClause
      : {
          bool: {
            must_not: [existsClause]
          }
        };
  }

  if (!rawValue) {
    return null;
  }

  if (field === '_id') {
    if (operator === 'contains') {
      return {
        query_string: {
          fields: ['_id'],
          query: `*${escapeQueryStringValue(rawValue)}*`,
          analyze_wildcard: true,
          default_operator: 'and'
        }
      };
    }

    if (operator === 'eq') {
      return {
        ids: {
          values: [rawValue]
        }
      };
    }

    throw new Error('_id 仅支持 包含、等于、有这个字段 三种筛选方式');
  }

  if (operator === 'contains') {
    return {
      query_string: {
        fields: [field],
        query: `*${escapeQueryStringValue(rawValue)}*`,
        analyze_wildcard: true,
        lenient: true,
        default_operator: 'and'
      }
    };
  }

  if (operator === 'eq') {
    if (fieldOption.type === 'boolean' || ['byte', 'short', 'integer', 'long', 'unsigned_long', 'half_float', 'float', 'double', 'scaled_float'].includes(fieldOption.type)) {
      const normalizedValue = normalizeFilterValue(rawValue);
      return {
        term: {
          [field]: normalizedValue
        }
      };
    }

    if (['date', 'date_nanos', 'ip', 'version'].includes(fieldOption.type)) {
      return {
        term: {
          [field]: rawValue
        }
      };
    }

    const exactValue = rawValue;

    return {
      bool: {
        should: [
          {
            term: {
              [`${field}.keyword`]: exactValue
            }
          },
          {
            match_phrase: {
              [field]: exactValue
            }
          }
        ],
        minimum_should_match: 1
      }
    };
  }

  return {
    range: {
      [field]: {
        [operator]: normalizeFilterValue(rawValue)
      }
    }
  };
}

function buildFilterClauses(
  filters: QueryFilter[] | undefined,
  fieldOptions: Record<string, IndexFieldOption>
): Record<string, unknown>[] {
  if (!filters?.length) {
    return [];
  }

  return filters
    .map((filter) => buildSingleFilterClause(filter, fieldOptions))
    .filter((item): item is Record<string, unknown> => item !== null);
}

function buildSearchBody(
  payload: SearchRequestPayload,
  fieldOptions: Record<string, IndexFieldOption>
): Record<string, unknown> {
  const keyword = payload.keyword?.trim();
  const filterClauses = buildFilterClauses(payload.filters, fieldOptions);
  const filterJoinMode: FilterJoinMode = payload.filterJoinMode === 'or' ? 'or' : 'and';

  if (!keyword && filterClauses.length === 0) {
    return {
      query: { match_all: {} },
      sort: [{ _score: 'desc' }]
    };
  }

  const mustClauses: Record<string, unknown>[] = [];

  if (keyword) {
    mustClauses.push(buildKeywordClause(keyword));
  }

  return {
    query: {
      bool: {
        ...(mustClauses.length > 0 ? { must: mustClauses } : { must: [{ match_all: {} }] }),
        ...(filterClauses.length > 0
          ? filterJoinMode === 'or'
            ? {
                should: filterClauses,
                minimum_should_match: 1
              }
            : {
                filter: filterClauses
              }
          : {})
      }
    }
  };
}

function buildPartialDocument(changes: Record<string, PrimitiveValue>): Record<string, unknown> {
  const document: Record<string, unknown> = {};

  Object.entries(changes).forEach(([path, value]) => {
    const segments = path.split('.');
    let current: Record<string, unknown> = document;

    segments.forEach((segment, index) => {
      const isLast = index === segments.length - 1;

      if (isLast) {
        current[segment] = value;
        return;
      }

      if (typeof current[segment] !== 'object' || current[segment] === null || Array.isArray(current[segment])) {
        current[segment] = {};
      }

      current = current[segment] as Record<string, unknown>;
    });
  });

  return document;
}

export async function testEsConnection(connection: ConnectionConfig): Promise<ConnectionTestResult> {
  const client = createClient(connection);

  try {
    const info = await client.info();
    const clusterName = typeof info.cluster_name === 'string' ? info.cluster_name : '';
    const version =
      typeof info.version === 'object' && info.version && 'number' in info.version
        ? String(info.version.number)
        : undefined;

    return {
      success: true,
      message: '连接成功',
      version,
      clusterName
    };
  } catch (error) {
    return {
      success: false,
      message: formatConnectionError(error)
    };
  }
}

export async function fetchIndices(connection: ConnectionConfig): Promise<IndexSummary[]> {
  const client = createClient(connection);
  const result = await client.cat.indices({ format: 'json' });

  return result
    .map((item) => ({
      name: item.index ?? '',
      docCount: item['docs.count'] ? Number(item['docs.count']) : undefined,
      health: item.health,
      status: item.status
    }))
    .filter((item) => item.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

export async function fetchIndexFields(
  connection: ConnectionConfig,
  index: string
): Promise<IndexFieldOption[]> {
  const client = createClient(connection);
  const mapping = await client.indices.getMapping({ index });
  const indexMapping = mapping[index];

  if (!indexMapping?.mappings || typeof indexMapping.mappings !== 'object') {
    return [];
  }

  const rootMappings = indexMapping.mappings as Record<string, unknown>;
  const properties =
    rootMappings.properties && typeof rootMappings.properties === 'object' && !Array.isArray(rootMappings.properties)
      ? (rootMappings.properties as Record<string, unknown>)
      : undefined;

  const fields = collectFieldMappings(properties);
  fields.unshift({
    name: '_id',
    type: 'metadata',
    filterScope: 'standard'
  });

  return fields.sort((a, b) => {
    if (a.name === '_id') return -1;
    if (b.name === '_id') return 1;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

export async function fetchIndexMetadata(
  connection: ConnectionConfig,
  index: string
): Promise<IndexMetadataResult> {
  const client = createClient(connection);
  const [settingsResult, mappingResult] = await Promise.all([
    client.indices.getSettings({ index }),
    client.indices.getMapping({ index })
  ]);

  const settings = settingsResult[index]?.settings;
  const mappings = mappingResult[index]?.mappings;

  return {
    index,
    settings: settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {},
    mappings: mappings && typeof mappings === 'object' ? (mappings as Record<string, unknown>) : {}
  };
}

export async function searchDocuments(
  connection: ConnectionConfig,
  payload: SearchRequestPayload
): Promise<SearchDocumentsResult> {
  const client = createClient(connection);
  const indexFields = await fetchIndexFields(connection, payload.index);
  const body = buildSearchBody(payload, getFieldOptionMap(indexFields));
  const size = Math.min(Math.max(payload.size ?? 50, 1), 200);
  const from = Math.max(payload.from ?? 0, 0);
  const result = await client.search({
    index: payload.index,
    from,
    size,
    body
  });

  const totalValue =
    typeof result.hits.total === 'number'
      ? result.hits.total
      : (result.hits.total?.value ?? result.hits.hits.length);

  const documents = result.hits.hits.map((hit) => ({
    _id: String(hit._id),
    _index: String(hit._index),
    _source: (hit._source ?? {}) as Record<string, unknown>
  }));

  return {
    documents,
    total: totalValue
  };
}

function stringifyDslPayload(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload;
  }

  if (payload === undefined) {
    return '';
  }

  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

export async function executeDslRequest(
  connection: ConnectionConfig,
  payload: ExecuteDslRequestPayload
): Promise<ExecuteDslResult> {
  const client = createClient(connection);
  const method = payload.method.trim().toUpperCase();
  const path = payload.path.trim();
  const bodyText = payload.bodyText?.trim();
  let body: Record<string, unknown> | Array<unknown> | string | undefined;

  if (bodyText) {
    try {
      const parsedBody = JSON.parse(bodyText) as unknown;

      if (parsedBody === null) {
        throw new Error('请求体暂不支持单独的 null');
      }

      if (typeof parsedBody === 'string' || typeof parsedBody === 'number' || typeof parsedBody === 'boolean') {
        body = JSON.stringify(parsedBody);
      } else {
        body = parsedBody as Record<string, unknown> | Array<unknown>;
      }
    } catch {
      throw new Error('请求体不是合法 JSON');
    }
  }

  try {
    const result = await client.transport.request<Record<string, unknown>>(
      {
        method,
        path,
        ...(body !== undefined ? { body } : {})
      },
      { meta: true }
    );

    return {
      statusCode: typeof result.statusCode === 'number' ? result.statusCode : 200,
      responseBody: stringifyDslPayload(result.body)
    };
  } catch (error) {
    const responseError = error as {
      statusCode?: number;
      body?: unknown;
      meta?: {
        statusCode?: number;
        body?: unknown;
      };
      message?: string;
    };

    const statusCode = responseError.statusCode ?? responseError.meta?.statusCode;
    const errorBody = responseError.body ?? responseError.meta?.body;

    if (typeof statusCode === 'number') {
      return {
        statusCode,
        responseBody: errorBody !== undefined ? stringifyDslPayload(errorBody) : responseError.message ?? '请求失败'
      };
    }

    throw error;
  }
}

export async function createDocument(
  connection: ConnectionConfig,
  index: string,
  id: string | undefined,
  document: Record<string, PrimitiveValue>
): Promise<SaveDocumentResult> {
  const client = createClient(connection);
  const normalizedId = id?.trim();

  try {
    const requestDocument = buildPartialDocument(document);
    let responseId = normalizedId ?? '';

    if (normalizedId) {
      await client.create({
        index,
        id: normalizedId,
        document: requestDocument,
        refresh: true
      });
    } else {
      const result = await client.index({
        index,
        document: requestDocument,
        refresh: true
      });
      responseId = String(result._id);
    }

    return {
      id: responseId,
      success: true
    };
  } catch (error) {
    return {
      id: normalizedId ?? '',
      success: false,
      message: error instanceof Error ? error.message : '新增失败'
    };
  }
}

export async function updateDocument(
  connection: ConnectionConfig,
  index: string,
  id: string,
  changes: Record<string, PrimitiveValue>
): Promise<SaveDocumentResult> {
  const client = createClient(connection);

  try {
    await client.update({
      index,
      id,
      doc: buildPartialDocument(changes),
      retry_on_conflict: 3,
      refresh: true
    });

    return {
      id,
      success: true
    };
  } catch (error) {
    return {
      id,
      success: false,
      message: error instanceof Error ? error.message : '保存失败'
    };
  }
}

export async function deleteDocument(
  connection: ConnectionConfig,
  index: string,
  id: string
): Promise<DeleteDocumentResult> {
  const client = createClient(connection);

  try {
    await client.delete({
      index,
      id,
      refresh: true
    });

    return {
      id,
      success: true
    };
  } catch (error) {
    return {
      id,
      success: false,
      message: error instanceof Error ? error.message : '删除失败'
    };
  }
}
