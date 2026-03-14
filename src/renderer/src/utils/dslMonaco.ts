import type * as MonacoEditor from 'monaco-editor';
import type { IndexFieldOption } from '../../../shared/types';

type Monaco = typeof MonacoEditor;

export const DSL_LANGUAGE_ID = 'tiny-es-dsl';
export const DSL_THEME_ID = 'tiny-es-dsl-theme';
export const DSL_DARK_THEME_ID = 'tiny-es-dsl-theme-dark';

interface DslCompletionContext {
  selectedIndex?: string;
  availableIndices: string[];
  fieldOptions: IndexFieldOption[];
}

interface RequestTemplate {
  method: string;
  path: string;
  detail: string;
}

const REQUEST_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'];
const STRING_FIELD_TYPES = new Set(['text', 'keyword', 'constant_keyword', 'wildcard']);
const RANGE_FIELD_TYPES = new Set([
  'integer',
  'long',
  'short',
  'byte',
  'double',
  'float',
  'half_float',
  'scaled_float',
  'unsigned_long',
  'date',
  'date_nanos'
]);

let languageReady = false;
let themeReady = false;

function buildRequestTemplate(method: string, path: string, detail: string): RequestTemplate {
  return {
    method,
    path,
    detail
  };
}

function getRequestTemplates(selectedIndex: string | undefined, availableIndices: string[]): RequestTemplate[] {
  const preferredIndex = selectedIndex || availableIndices[0];
  const indexNames = Array.from(new Set([preferredIndex, ...availableIndices].filter(Boolean))) as string[];

  const templates: RequestTemplate[] = [
    buildRequestTemplate('GET', '/_cluster/health', '集群健康状态'),
    buildRequestTemplate('GET', '/_search', '全局搜索'),
    buildRequestTemplate('POST', '/_search', '全局搜索'),
    buildRequestTemplate('GET', '/_count', '全局数量统计'),
    buildRequestTemplate('POST', '/_count', '全局数量统计'),
    buildRequestTemplate('GET', '/_mapping', '查看全部索引映射'),
    buildRequestTemplate('GET', '/_settings', '查看全部索引设置'),
    buildRequestTemplate('PUT', '/_settings', '更新全部索引设置'),
    buildRequestTemplate('GET', '/_analyze', '分析文本'),
    buildRequestTemplate('POST', '/_analyze', '分析文本'),
    buildRequestTemplate('POST', '/_bulk', 'Bulk 批量写入'),
    buildRequestTemplate('GET', '/_msearch', '批量搜索'),
    buildRequestTemplate('POST', '/_msearch', '批量搜索'),
    buildRequestTemplate('GET', '/_refresh', '刷新索引'),
    buildRequestTemplate('POST', '/_reindex', '重建索引'),
    buildRequestTemplate('POST', '/_aliases', '批量维护别名'),
    buildRequestTemplate('GET', '/_cat/indices?v=true', '查看索引列表'),
    buildRequestTemplate('GET', '/_cat/aliases?v=true', '查看别名列表'),
    buildRequestTemplate('GET', '/_cat/count?v=true', '查看索引文档数'),
    buildRequestTemplate('GET', '/_cat/shards?v=true', '查看分片状态'),
    buildRequestTemplate('GET', '/_cat/nodes?v=true', '查看节点列表'),
    buildRequestTemplate('GET', '/_nodes', '查看节点信息'),
    buildRequestTemplate('GET', '/_nodes/stats', '查看节点统计')
  ];

  indexNames.forEach((indexName) => {
    templates.push(
      buildRequestTemplate('GET', `/${indexName}`, '查看索引信息'),
      buildRequestTemplate('HEAD', `/${indexName}`, '检查索引是否存在'),
      buildRequestTemplate('DELETE', `/${indexName}`, '删除索引'),
      buildRequestTemplate('GET', `/${indexName}/_search`, '索引搜索'),
      buildRequestTemplate('POST', `/${indexName}/_search`, '索引搜索'),
      buildRequestTemplate('GET', `/${indexName}/_count`, '统计命中数量'),
      buildRequestTemplate('POST', `/${indexName}/_count`, '统计命中数量'),
      buildRequestTemplate('GET', `/${indexName}/_mapping`, '查看索引映射'),
      buildRequestTemplate('PUT', `/${indexName}/_mapping`, '更新索引映射'),
      buildRequestTemplate('GET', `/${indexName}/_settings`, '查看索引设置'),
      buildRequestTemplate('PUT', `/${indexName}/_settings`, '更新索引设置'),
      buildRequestTemplate('POST', `/${indexName}/_bulk`, '索引内 Bulk 写入'),
      buildRequestTemplate('GET', `/${indexName}/_msearch`, '索引内批量搜索'),
      buildRequestTemplate('POST', `/${indexName}/_msearch`, '索引内批量搜索'),
      buildRequestTemplate('GET', `/${indexName}/_refresh`, '刷新当前索引'),
      buildRequestTemplate('GET', `/${indexName}/_analyze`, '分析文本'),
      buildRequestTemplate('POST', `/${indexName}/_analyze`, '分析文本'),
      buildRequestTemplate('POST', `/${indexName}/_update_by_query`, '按条件批量更新'),
      buildRequestTemplate('POST', `/${indexName}/_delete_by_query`, '按条件批量删除')
    );
  });

  return templates;
}

function getRequestLineNumber(model: MonacoEditor.editor.ITextModel): number {
  for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber += 1) {
    if (model.getLineContent(lineNumber).trim()) {
      return lineNumber;
    }
  }

  return 1;
}

function buildRequestLineCompletions(
  monaco: Monaco,
  model: MonacoEditor.editor.ITextModel,
  position: MonacoEditor.Position,
  context: DslCompletionContext
): MonacoEditor.languages.CompletionList {
  const lineNumber = position.lineNumber;
  const lineContent = model.getLineContent(lineNumber);
  const trimmedLine = lineContent.trim();
  const lineStartColumn = lineContent.search(/\S|$/) + 1;
  const lineEndColumn = lineContent.length + 1;

  if (!trimmedLine || !trimmedLine.includes(' ')) {
    const normalizedQuery = trimmedLine.toUpperCase();
    const fullLineRange = {
      startLineNumber: lineNumber,
      endLineNumber: lineNumber,
      startColumn: lineStartColumn,
      endColumn: lineEndColumn
    };

    const requestLineSuggestions = getRequestTemplates(context.selectedIndex, context.availableIndices)
      .filter((template) => {
        if (!normalizedQuery) {
          return true;
        }

        return `${template.method} ${template.path}`.toUpperCase().includes(normalizedQuery);
      })
      .map((template, index) => ({
        label: `${template.method} ${template.path}`,
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: `${template.method} ${template.path}`,
        detail: template.detail,
        sortText: `0-${index.toString().padStart(3, '0')}`,
        range: fullLineRange
      }));

    const methodSuggestions = REQUEST_METHODS
      .filter((method) => !normalizedQuery || method.includes(normalizedQuery))
      .map((method, index) => ({
        label: method,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: `${method} `,
        detail: 'HTTP 方法',
        sortText: `00-${index}`,
        range: fullLineRange
      }));

    return {
      suggestions: [...methodSuggestions, ...requestLineSuggestions]
    };
  }

  const methodMatch = lineContent.match(/^\s*([A-Za-z]+)\s+(\S*)?$/);
  const pathValue = methodMatch?.[2] || '';
  const pathStartColumn = methodMatch
    ? lineContent.indexOf(pathValue, lineContent.indexOf(methodMatch[1]) + methodMatch[1].length) + 1
    : position.column;
  const pathRange = {
    startLineNumber: lineNumber,
    endLineNumber: lineNumber,
    startColumn: Math.max(pathStartColumn, 1),
    endColumn: lineEndColumn
  };

  const pathSuggestions = getRequestTemplates(context.selectedIndex, context.availableIndices)
    .filter((template) => template.method === (methodMatch?.[1] || '').toUpperCase())
    .filter((template) => !pathValue || template.path.includes(pathValue))
    .map((template, index) => ({
      label: template.path,
      kind: monaco.languages.CompletionItemKind.Reference,
      insertText: template.path,
      detail: template.detail,
      sortText: `1-${index.toString().padStart(3, '0')}`,
      range: pathRange
    }));

  return {
    suggestions: pathSuggestions
  };
}

function buildBodySnippetSuggestions(
  monaco: Monaco,
  range: MonacoEditor.IRange
): MonacoEditor.languages.CompletionItem[] {
  return [
    {
      label: 'query.match_all',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"query": {', '  "match_all": {}', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '查询全部文档',
      range
    },
    {
      label: 'query.bool',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"query": {', '  "bool": {', '    "must": [$1],', '    "filter": [],', '    "should": [],', '    "must_not": []', '  }', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '布尔查询模板',
      range
    },
    {
      label: 'query.match',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"query": {', '  "match": {', '    "${1:field}": "${2:value}"', '  }', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '全文匹配查询模板',
      range
    },
    {
      label: 'query.term',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"query": {', '  "term": {', '    "${1:field}": "${2:value}"', '  }', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '精确匹配查询模板',
      range
    },
    {
      label: 'query.range',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"query": {', '  "range": {', '    "${1:field}": {', '      "gte": ${2:0},', '      "lte": ${3:100}', '    }', '  }', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '范围查询模板',
      range
    },
    {
      label: 'query.exists',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"query": {', '  "exists": {', '    "field": "${1:field}"', '  }', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '字段存在查询模板',
      range
    },
    {
      label: 'query.terms',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"query": {', '  "terms": {', '    "${1:field}": ["${2:value1}", "${3:value2}"]', '  }', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '批量精确匹配查询模板',
      range
    },
    {
      label: 'query.multi_match',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"query": {', '  "multi_match": {', '    "query": "${1:value}",', '    "fields": ["${2:field1}", "${3:field2}"]', '  }', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '多字段匹配查询模板',
      range
    },
    {
      label: 'query.nested',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"query": {', '  "nested": {', '    "path": "${1:path}",', '    "query": {', '      "match": {', '        "${2:path.field}": "${3:value}"', '      }', '    }', '  }', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '嵌套查询模板',
      range
    },
    {
      label: 'query.ids',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"query": {', '  "ids": {', '    "values": ["${1:id1}", "${2:id2}"]', '  }', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '按文档 ID 查询模板',
      range
    },
    {
      label: 'match',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"match": {', '  "${1:field}": "${2:value}"', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '全文匹配',
      range
    },
    {
      label: 'term',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"term": {', '  "${1:field}": "${2:value}"', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '精确匹配',
      range
    },
    {
      label: 'range',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"range": {', '  "${1:field}": {', '    "gte": ${2:0},', '    "lte": ${3:100}', '  }', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '范围查询',
      range
    },
    {
      label: 'exists',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"exists": {', '  "field": "${1:field}"', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '字段存在',
      range
    },
    {
      label: '_source',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"_source": ["${1:field1}", "${2:field2}"]'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '指定返回字段',
      range
    },
    {
      label: 'from',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: '"from": ${1:0}',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '分页起始位置',
      range
    },
    {
      label: 'size',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: '"size": ${1:10}',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '返回条数',
      range
    },
    {
      label: 'track_total_hits',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: '"track_total_hits": true',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '精确统计命中总数',
      range
    },
    {
      label: 'sort',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"sort": [', '  {', '    "${1:field}": {', '      "order": "${2:desc}"', '    }', '  }', ']'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '排序模板',
      range
    },
    {
      label: 'aggs',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"aggs": {', '  "${1:agg_name}": {', '    "terms": {', '      "field": "${2:field}"', '    }', '  }', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '聚合模板',
      range
    },
    {
      label: 'aggs.date_histogram',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"aggs": {', '  "${1:agg_name}": {', '    "date_histogram": {', '      "field": "${2:date_field}",', '      "calendar_interval": "${3:day}"', '    }', '  }', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '日期直方图聚合模板',
      range
    },
    {
      label: 'highlight',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"highlight": {', '  "fields": {', '    "${1:field}": {}', '  }', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '高亮模板',
      range
    },
    {
      label: 'post_filter',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"post_filter": {', '  "term": {', '    "${1:field}": "${2:value}"', '  }', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '后置过滤模板',
      range
    },
    {
      label: 'collapse',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"collapse": {', '  "field": "${1:field}"', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '结果折叠模板',
      range
    },
    {
      label: 'script',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"script": {', '  "source": "${1:ctx._source.count += params.step}",', '  "params": {', '    "step": ${2:1}', '  }', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '脚本模板',
      range
    },
    {
      label: 'runtime_mappings',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"runtime_mappings": {', '  "${1:runtime_field}": {', '    "type": "${2:keyword}",', '    "script": {', '      "source": "${3:emit(doc[\\\"field\\\"].value)}"', '    }', '  }', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '运行时字段模板',
      range
    },
    {
      label: 'update.doc',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"doc": {', '  "${1:field}": "${2:value}"', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '局部更新模板',
      range
    },
    {
      label: 'bulk.index',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['{ "index": { "_index": "${1:index}", "_id": "${2:id}" } }', '{ "${3:field}": "${4:value}" }'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: 'Bulk 写入模板',
      range
    },
    {
      label: 'bulk.delete',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: '{ "delete": { "_index": "${1:index}", "_id": "${2:id}" } }',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: 'Bulk 删除模板',
      range
    },
    {
      label: 'reindex',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"source": {', '  "index": "${1:source_index}"', '},', '"dest": {', '  "index": "${2:dest_index}"', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '重建索引模板',
      range
    },
    {
      label: 'aliases.add',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"actions": [', '  {', '    "add": {', '      "index": "${1:index}",', '      "alias": "${2:alias}"', '    }', '  }', ']'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '别名添加模板',
      range
    },
    {
      label: 'settings.refresh_interval',
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"index": {', '  "refresh_interval": "${1:1s}"', '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: '索引设置模板',
      range
    }
  ];
}

function buildFieldCompletionItems(
  monaco: Monaco,
  fieldOptions: IndexFieldOption[],
  range: MonacoEditor.IRange,
  model: MonacoEditor.editor.ITextModel,
  position: MonacoEditor.Position
): MonacoEditor.languages.CompletionItem[] {
  const lineContent = model.getLineContent(position.lineNumber);
  const quoteAwareInsertText = (() => {
    const charBeforeWord = lineContent[range.startColumn - 2];
    const charAfterWord = lineContent[range.endColumn - 1];
    const insideDoubleQuotes = charBeforeWord === '"' && charAfterWord === '"';

    return (fieldName: string) => (insideDoubleQuotes ? fieldName : `"${fieldName}"`);
  })();

  const sortedFields = fieldOptions
    .filter((field) => field.name !== '_id')
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

  return sortedFields.flatMap((field, index) => {
    const baseField = {
      label: field.name,
      detail: `字段 · ${field.type}`,
      sortText: `2-${index.toString().padStart(3, '0')}`
    };

    const sharedItems: MonacoEditor.languages.CompletionItem[] = [
      {
        ...baseField,
        kind: monaco.languages.CompletionItemKind.Field,
        insertText: quoteAwareInsertText(field.name),
        documentation: `${field.name} · ${field.type}`,
        range
      }
    ];

    if (STRING_FIELD_TYPES.has(field.type)) {
      sharedItems.push(
        {
          label: `match ${field.name}`,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: ['"match": {', `  "${field.name}": "\${1:value}"`, '}'].join('\n'),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: `全文匹配 · ${field.type}`,
          sortText: `3-${index.toString().padStart(3, '0')}`,
          range
        },
        {
          label: `term ${field.name}`,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: ['"term": {', `  "${field.name}": "\${1:value}"`, '}'].join('\n'),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: `精确匹配 · ${field.type}`,
          sortText: `4-${index.toString().padStart(3, '0')}`,
          range
        }
      );
    }

    if (RANGE_FIELD_TYPES.has(field.type)) {
      sharedItems.push({
        label: `range ${field.name}`,
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: ['"range": {', `  "${field.name}": {`, '    "gte": ${1:0},', '    "lte": ${2:100}', '  }', '}'].join('\n'),
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: `范围查询 · ${field.type}`,
        sortText: `5-${index.toString().padStart(3, '0')}`,
        range
      });
    }

    sharedItems.push({
      label: `exists ${field.name}`,
      kind: monaco.languages.CompletionItemKind.Snippet,
      insertText: ['"exists": {', `  "field": "${field.name}"`, '}'].join('\n'),
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      detail: `字段存在 · ${field.type}`,
      sortText: `6-${index.toString().padStart(3, '0')}`,
      range
    });

    return sharedItems;
  });
}

function formatDslDocument(value: string): string | null {
  const normalized = value.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const requestLineIndex = lines.findIndex((line) => line.trim());

  if (requestLineIndex < 0) {
    return normalized;
  }

  const requestLine = lines[requestLineIndex].trim();
  const bodyText = lines.slice(requestLineIndex + 1).join('\n').trim();

  if (!bodyText) {
    return requestLine;
  }

  try {
    const formattedBody = JSON.stringify(JSON.parse(bodyText), null, 2);
    return `${requestLine}\n\n${formattedBody}`;
  } catch {
    return null;
  }
}

export function ensureDslLanguage(monaco: Monaco): void {
  if (!languageReady) {
    monaco.languages.register({ id: DSL_LANGUAGE_ID });
    monaco.languages.setLanguageConfiguration(DSL_LANGUAGE_ID, {
      brackets: [
        ['{', '}'],
        ['[', ']'],
        ['(', ')']
      ],
      autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '"', close: '"' }
      ],
      surroundingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '"', close: '"' }
      ]
    });
    monaco.languages.setMonarchTokensProvider(DSL_LANGUAGE_ID, {
      tokenizer: {
        root: [
          [/^\s*(GET|POST|PUT|DELETE|PATCH|HEAD)\b/, 'keyword'],
          [/\b(GET|POST|PUT|DELETE|PATCH|HEAD)\b/, 'keyword'],
          [/\/[A-Za-z0-9_.*,\-/=?&%]*/, 'type.identifier'],
          [/"([^"\\]|\\.)*"/, 'string'],
          [/\b(true|false|null)\b/, 'keyword'],
          [/-?\d+(\.\d+)?/, 'number'],
          [/[{}[\]()]/, 'delimiter.bracket']
        ]
      }
    });
    monaco.languages.registerDocumentFormattingEditProvider(DSL_LANGUAGE_ID, {
      provideDocumentFormattingEdits(model) {
        const formattedValue = formatDslDocument(model.getValue());

        if (formattedValue === null) {
          return [];
        }

        return [
          {
            range: model.getFullModelRange(),
            text: formattedValue
          }
        ];
      }
    });
    languageReady = true;
  }

  if (!themeReady) {
    monaco.editor.defineTheme(DSL_THEME_ID, {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'ef5d93', fontStyle: 'bold' },
        { token: 'type.identifier', foreground: 'de79a4' },
        { token: 'string', foreground: 'd46593' },
        { token: 'number', foreground: 'bf6c87' },
        { token: 'delimiter.bracket', foreground: 'd65a90' }
      ],
      colors: {
        'editor.background': '#fffafc',
        'editor.foreground': '#374151',
        'editor.lineHighlightBackground': '#fff4f8',
        'editorLineNumber.foreground': '#d6a0ba',
        'editorLineNumber.activeForeground': '#ef5d93',
        'editorCursor.foreground': '#ef5d93',
        'editor.selectionBackground': '#ffdce9',
        'editor.inactiveSelectionBackground': '#ffeaf2',
        'editorIndentGuide.background1': '#f6dce8',
        'editorIndentGuide.activeBackground1': '#ef5d93',
        'editorSuggestWidget.background': '#fff8fb',
        'editorSuggestWidget.border': '#f3d2e1',
        'editorSuggestWidget.foreground': '#5c6270',
        'editorSuggestWidget.selectedBackground': '#ffe6f0',
        'editorHoverWidget.background': '#fff8fb',
        'editorHoverWidget.border': '#f3d2e1'
      }
    });

    monaco.editor.defineTheme(DSL_DARK_THEME_ID, {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'ff8fba', fontStyle: 'bold' },
        { token: 'type.identifier', foreground: 'ffb7d1' },
        { token: 'string', foreground: 'ff9fc4' },
        { token: 'number', foreground: 'f6c38f' },
        { token: 'delimiter.bracket', foreground: 'ff9fc4' }
      ],
      colors: {
        'editor.background': '#17131d',
        'editor.foreground': '#f6e8ef',
        'editor.lineHighlightBackground': '#241a2b',
        'editorLineNumber.foreground': '#866b7f',
        'editorLineNumber.activeForeground': '#ff8fba',
        'editorCursor.foreground': '#ff8fba',
        'editor.selectionBackground': '#4a2941',
        'editor.inactiveSelectionBackground': '#352231',
        'editorIndentGuide.background1': '#352231',
        'editorIndentGuide.activeBackground1': '#ff8fba',
        'editorSuggestWidget.background': '#1c1623',
        'editorSuggestWidget.border': '#463242',
        'editorSuggestWidget.foreground': '#f5dbe7',
        'editorSuggestWidget.selectedBackground': '#3b2434',
        'editorHoverWidget.background': '#1c1623',
        'editorHoverWidget.border': '#463242'
      }
    });
    themeReady = true;
  }
}

export function registerDslCompletionProvider(
  monaco: Monaco,
  context: DslCompletionContext
): MonacoEditor.IDisposable {
  return monaco.languages.registerCompletionItemProvider(DSL_LANGUAGE_ID, {
    triggerCharacters: ['/', '"', '_', '.', ':'],
    provideCompletionItems(model, position) {
      const requestLineNumber = getRequestLineNumber(model);

      if (position.lineNumber === requestLineNumber) {
        return buildRequestLineCompletions(monaco, model, position, context);
      }

      const wordUntilPosition = model.getWordUntilPosition(position);
      const bodyRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: wordUntilPosition.startColumn,
        endColumn: wordUntilPosition.endColumn
      };

      return {
        suggestions: [
          ...buildBodySnippetSuggestions(monaco, bodyRange),
          ...buildFieldCompletionItems(monaco, context.fieldOptions, bodyRange, model, position)
        ]
      };
    }
  });
}
