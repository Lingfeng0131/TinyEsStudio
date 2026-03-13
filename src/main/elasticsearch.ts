import { Client } from '@elastic/elasticsearch';
import type {
  ConnectionConfig,
  ConnectionTestResult,
  FilterOperator,
  IndexFieldOption,
  IndexSummary,
  PrimitiveValue,
  QueryFilter,
  SaveDocumentResult,
  SearchDocumentsResult,
  SearchRequestPayload
} from '../shared/types';

function collectFieldMappings(
  properties: Record<string, unknown> | undefined,
  prefix = ''
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
    const childProperties =
      mapping.properties && typeof mapping.properties === 'object' && !Array.isArray(mapping.properties)
        ? (mapping.properties as Record<string, unknown>)
        : undefined;

    if (childProperties) {
      fields.push(...collectFieldMappings(childProperties, fieldName));
      return;
    }

    if (fieldType !== 'object' && fieldType !== 'nested') {
      fields.push({
        name: fieldName,
        type: fieldType
      });
    }
  });

  return fields;
}

function createClient(connection: ConnectionConfig): Client {
  const hasAuth = Boolean(connection.username);

  return new Client({
    node: connection.nodeUrl,
    enableMetaHeader: false,
    auth: hasAuth
      ? {
          username: connection.username ?? '',
          password: connection.password ?? ''
        }
      : undefined
  });
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

function buildSingleFilterClause(filter: QueryFilter): Record<string, unknown> | null {
  const field = filter.field.trim();
  if (!field) {
    return null;
  }

  const operator = filter.operator as FilterOperator;
  const rawValue = filter.value?.trim() ?? '';

  if (operator === 'exists') {
    return {
      exists: {
        field
      }
    };
  }

  if (!rawValue) {
    return null;
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
    const normalizedValue = normalizeFilterValue(rawValue);

    if (typeof normalizedValue === 'boolean' || typeof normalizedValue === 'number') {
      return {
        term: {
          [field]: normalizedValue
        }
      };
    }

    return {
      bool: {
        should: [
          {
            term: {
              [`${field}.keyword`]: normalizedValue
            }
          },
          {
            match_phrase: {
              [field]: normalizedValue
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

function buildFilterClauses(filters: QueryFilter[] | undefined): Record<string, unknown>[] {
  if (!filters?.length) {
    return [];
  }

  return filters
    .map(buildSingleFilterClause)
    .filter((item): item is Record<string, unknown> => item !== null);
}

function buildSearchBody(payload: SearchRequestPayload): Record<string, unknown> {
  if (payload.mode === 'json') {
    if (!payload.jsonQuery?.trim()) {
      return { query: { match_all: {} } };
    }

    try {
      return JSON.parse(payload.jsonQuery) as Record<string, unknown>;
    } catch {
      throw new Error('JSON 查询格式不正确');
    }
  }

  const keyword = payload.keyword?.trim();
  const filterClauses = buildFilterClauses(payload.filters);

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
        ...(filterClauses.length > 0 ? { filter: filterClauses } : {})
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
    const message = error instanceof Error ? error.message : '连接失败';
    return {
      success: false,
      message
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

  return collectFieldMappings(properties).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

export async function searchDocuments(
  connection: ConnectionConfig,
  payload: SearchRequestPayload
): Promise<SearchDocumentsResult> {
  const client = createClient(connection);
  const body = buildSearchBody(payload);
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
