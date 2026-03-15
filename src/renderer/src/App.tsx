import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  AppShell,
  Button,
  Card,
  Group,
  Loader,
  MantineProvider,
  Modal,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
  createTheme
} from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import {
  IconDeviceFloppy,
  IconPlus,
  IconChevronsLeft,
  IconChevronsRight,
  IconChevronLeft,
  IconChevronRight,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconInfoCircle,
  IconMoonStars,
  IconPlugConnected,
  IconSunHigh,
  IconTerminal2,
  IconTable,
  IconTrash
} from '@tabler/icons-react';
import type {
  ConnectionConfig,
  ConnectionInput,
  EsDocument,
  FilterJoinMode,
  IndexFieldOption,
  IndexMetadataResult,
  IndexSummary,
  QueryFilter,
  SaveDocumentResult
} from '../../shared/types';
import { ConnectionSidebar } from './components/ConnectionSidebar';
import { DslWorkspace } from './components/DslWorkspace';
import { DocumentsGrid } from './components/DocumentsGrid';
import { ErrorBoundary } from './components/ErrorBoundary';
import { JsonDetailPanel } from './components/JsonDetailPanel';
import { QueryToolbar } from './components/QueryToolbar';
import appIcon from './assets/app-icon.png';
import type { DirtyState, GridRow } from './types';
import { showAppNotification } from './utils/appNotifications';
import {
  applyChangesToDocumentSource,
  buildDocumentFromGridRow,
  collectFieldNames,
  getPrimitiveValueByPath,
  toGridRows
} from './utils/documentTable';

const theme = createTheme({
  primaryColor: 'pink',
  fontFamily: '"Nunito", "PingFang SC", "Microsoft YaHei", sans-serif',
  defaultRadius: 'xl',
  colors: {
    pink: ['#fff0f4', '#ffe0ea', '#ffcade', '#ffb1cf', '#ff95bc', '#ff7eae', '#ff6ca4', '#ef4b8a', '#d93a79', '#b32866'],
    blue: ['#fff3f7', '#ffe6ef', '#ffd3e4', '#ffbdd6', '#ffa2c3', '#ff8cb4', '#ff79a7', '#ef5d93', '#d9477f', '#bf316a'],
    mint: ['#fff7fa', '#ffedf4', '#ffdce9', '#ffc8dd', '#ffb0cf', '#ff9bc2', '#ff89b7', '#ea6fa0', '#cf5a8b', '#b24675']
  },
  components: {
    Button: {
      defaultProps: {
        radius: 'xl'
      }
    },
    Card: {
      defaultProps: {
        radius: 'xl'
      }
    },
    TextInput: {
      defaultProps: {
        radius: 'xl'
      }
    },
    Textarea: {
      defaultProps: {
        radius: 'xl'
      }
    },
    NumberInput: {
      defaultProps: {
        radius: 'xl'
      }
    }
  }
});

const APP_VERSION = '1.0.0';
const APP_AUTHOR = 'Lingfeng';

function normalizeConnectionTestMessage(message: string): string {
  if (
    message.includes('self-signed certificate') ||
    message.includes('self signed certificate in certificate chain') ||
    message.includes('unable to verify the first certificate')
  ) {
    return 'HTTPS 证书校验失败：当前服务可能使用了自签名或内网证书。请编辑连接，勾选“忽略 HTTPS 证书校验”后再重试。';
  }

  if (message.includes('received plaintext http traffic on an https channel')) {
    return '当前 Elasticsearch 开启了 HTTPS，请把地址改成 https:// 开头';
  }

  if (message.includes('missing authentication credentials')) {
    return '连接需要认证，请填写用户名和密码后重试';
  }

  return message;
}

function normalizeUiErrorMessage(message: string): string {
  if (message.includes('[range] query does not support [not_exists]')) {
    return '当前运行中的主进程还是旧版本查询逻辑，尚未识别“没有这个字段”。请完整重启应用后再试。';
  }

  return normalizeConnectionTestMessage(message);
}

function buildDefaultDslRequest(index?: string): string {
  if (!index) {
    return 'GET /_cluster/health';
  }

  return `GET /${index}/_search\n\n{\n  "query": {\n    "match_all": {}\n  },\n  "size": 50\n}`;
}

type DetailTab = 'document' | 'settings' | 'mapping';
type WorkspaceMode = 'table' | 'dsl';
type ThemeMode = 'light' | 'dark';
const THEME_STORAGE_KEY = 'tiny-es-studio-theme-mode';

function parseDslRequestText(requestText: string): {
  method: string;
  path: string;
  bodyText?: string;
} {
  const normalizedLines = requestText.replace(/\r\n/g, '\n').split('\n');
  const firstLine = normalizedLines.find((line) => line.trim());

  if (!firstLine) {
    throw new Error('请先输入 DSL 请求，第一行格式示例：GET /_cluster/health');
  }

  const requestLineMatch = firstLine.trim().match(/^([A-Za-z]+)\s+(\S+)$/);

  if (!requestLineMatch) {
    throw new Error('第一行请使用“请求方法 路径”的格式，例如：GET /user_index/_search');
  }

  const [, method, rawPath] = requestLineMatch;
  const firstLineIndex = normalizedLines.findIndex((line) => line === firstLine);
  const bodyLines = normalizedLines.slice(firstLineIndex + 1);
  const bodyText = bodyLines.join('\n').trim();

  if (bodyText) {
    try {
      JSON.parse(bodyText);
    } catch {
      throw new Error('请求体不是合法 JSON');
    }
  }

  return {
    method: method.toUpperCase(),
    path: rawPath.startsWith('/') ? rawPath : `/${rawPath}`,
    ...(bodyText ? { bodyText } : {})
  };
}

function AppContent({
  themeMode,
  onToggleTheme
}: {
  themeMode: ThemeMode;
  onToggleTheme: () => void;
}) {
  const createFilter = (): QueryFilter => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    field: '',
    operator: 'contains',
    value: ''
  });

  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>();
  const [selectedIndex, setSelectedIndex] = useState<string>();
  const [indices, setIndices] = useState<IndexSummary[]>([]);
  const [indexFields, setIndexFields] = useState<IndexFieldOption[]>([]);
  const [indexMetadata, setIndexMetadata] = useState<IndexMetadataResult>();
  const [loadingIndexMetadata, setLoadingIndexMetadata] = useState(false);
  const [loadingIndices, setLoadingIndices] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [dslExecuting, setDslExecuting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('table');
  const [keyword, setKeyword] = useState('');
  const [dslRequest, setDslRequest] = useState(buildDefaultDslRequest());
  const [dslResponse, setDslResponse] = useState('');
  const [dslStatusCode, setDslStatusCode] = useState<number>();
  const [filters, setFilters] = useState<QueryFilter[]>([createFilter()]);
  const [filterJoinMode, setFilterJoinMode] = useState<FilterJoinMode>('and');
  const [size, setSize] = useState(50);
  const [documents, setDocuments] = useState<EsDocument[]>([]);
  const [rows, setRows] = useState<GridRow[]>([]);
  const [dirtyState, setDirtyState] = useState<DirtyState>({});
  const [selectedRowKey, setSelectedRowKey] = useState<string>();
  const [checkedRowKeys, setCheckedRowKeys] = useState<string[]>([]);
  const [gridScrollToTopSignal, setGridScrollToTopSignal] = useState(0);
  const [editorOpened, setEditorOpened] = useState(false);
  const [editingConnection, setEditingConnection] = useState<ConnectionConfig | null>(null);
  const [searchTotal, setSearchTotal] = useState(0);
  const [detailCollapsed, setDetailCollapsed] = useState(true);
  const [detailTab, setDetailTab] = useState<DetailTab>('document');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [queryPanelCollapsed, setQueryPanelCollapsed] = useState(false);
  const [aboutOpened, setAboutOpened] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1440 : window.innerWidth
  );
  const indicesRequestSeqRef = useRef(0);
  const indexFieldsRequestSeqRef = useRef(0);
  const indexMetadataRequestSeqRef = useRef(0);
  const searchRequestSeqRef = useRef(0);
  const dslRequestSeqRef = useRef(0);

  const selectedConnection = useMemo(
    () => connections.find((item) => item.id === selectedConnectionId),
    [connections, selectedConnectionId]
  );

  const selectedDocument = useMemo(
    () => documents.find((item) => `${item._index}:${item._id}` === selectedRowKey),
    [documents, selectedRowKey]
  );

  const selectedDraftRow = useMemo(
    () => rows.find((item) => item._rowKey === selectedRowKey && item._isDraft),
    [rows, selectedRowKey]
  );

  const checkedRowKeySet = useMemo(() => new Set(checkedRowKeys), [checkedRowKeys]);

  const checkedDocuments = useMemo(
    () => documents.filter((item) => checkedRowKeySet.has(`${item._index}:${item._id}`)),
    [checkedRowKeySet, documents]
  );

  const checkedDraftRows = useMemo(
    () => rows.filter((item) => item._isDraft && checkedRowKeySet.has(item._rowKey)),
    [checkedRowKeySet, rows]
  );

  const fieldTypeMap = useMemo(
    () =>
      indexFields.reduce<Record<string, string>>((accumulator, field) => {
        accumulator[field.name] = field.type;
        return accumulator;
      }, {}),
    [indexFields]
  );

  const fieldFormatMap = useMemo(
    () =>
      indexFields.reduce<Record<string, string>>((accumulator, field) => {
        if (field.format) {
          accumulator[field.name] = field.format;
        }
        return accumulator;
      }, {}),
    [indexFields]
  );

  const displayFields = useMemo(() => {
    const fieldSet = new Set<string>(collectFieldNames(documents));
    indexFields.forEach((field) => {
      if (field.name !== '_id') {
        fieldSet.add(field.name);
      }
    });
    return Array.from(fieldSet).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [documents, indexFields]);

  const fieldDateFormatHintMap = useMemo(
    () =>
      displayFields.reduce<Record<string, string>>((accumulator, field) => {
        const sampleValue = documents
          .map((document) => getPrimitiveValueByPath(document._source, field))
          .find((value) => typeof value === 'string' && value.trim().length > 0);

        if (typeof sampleValue === 'string' && sampleValue.trim()) {
          accumulator[field] = sampleValue.trim();
        }

        return accumulator;
      }, {}),
    [displayFields, documents]
  );

  const draftRows = useMemo(() => rows.filter((row) => row._isDraft), [rows]);

  const dirtyCount = useMemo(
    () =>
      Object.values(dirtyState).reduce((count, fields) => count + Object.keys(fields).length, 0),
    [dirtyState]
  );

  const canSave = useMemo(
    () => (dirtyCount > 0 || draftRows.length > 0) && !querying && !saving && !deleting,
    [deleting, dirtyCount, draftRows.length, querying, saving]
  );

  const canDelete = useMemo(
    () =>
      checkedRowKeys.length > 0 &&
      !querying &&
      !saving &&
      !deleting,
    [checkedRowKeys.length, deleting, querying, saving]
  );

  const totalPages = useMemo(() => {
    if (searchTotal <= 0) {
      return 1;
    }

    return Math.max(1, Math.ceil(searchTotal / size));
  }, [searchTotal, size]);

  const compactResultsLayout = useMemo(
    () => rows.length > 0 && rows.length <= 8,
    [rows.length]
  );
  const compactViewport = viewportWidth < 1520;
  const narrowViewport = viewportWidth < 1280;
  const compactHeader = viewportWidth < 1180;
  const headerHeight = narrowViewport ? 64 : 68;
  const mainViewportHeight = narrowViewport
    ? `calc(100vh - ${headerHeight + 16}px)`
    : `calc(100vh - ${headerHeight + 24}px)`;
  const shellPadding = narrowViewport ? 'xs' : 'sm';
  const navbarWidth = sidebarCollapsed ? 28 : compactViewport ? 312 : 348;
  const asideWidth = compactViewport ? 360 : 420;

  useEffect(() => {
    const handleResize = (): void => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (viewportWidth < 1360 && !sidebarCollapsed) {
      setSidebarCollapsed(true);
    }

    if (viewportWidth < 1200 && workspaceMode === 'table' && !queryPanelCollapsed) {
      setQueryPanelCollapsed(true);
    }
  }, [queryPanelCollapsed, sidebarCollapsed, viewportWidth, workspaceMode]);

  useEffect(() => {
    if (workspaceMode === 'dsl' && !detailCollapsed) {
      setDetailCollapsed(true);
    }
  }, [detailCollapsed, workspaceMode]);

  useEffect(() => {
    void loadConnections();
  }, []);

  useEffect(() => {
    if (selectedConnection) {
      void loadIndices(selectedConnection);
      return;
    }

    indicesRequestSeqRef.current += 1;
    indexFieldsRequestSeqRef.current += 1;
    indexMetadataRequestSeqRef.current += 1;
    searchRequestSeqRef.current += 1;
    dslRequestSeqRef.current += 1;
    setLoadingIndices(false);
    setLoadingIndexMetadata(false);
    setQuerying(false);
    setDslExecuting(false);
    setIndices([]);
    setSelectedIndex(undefined);
    setIndexFields([]);
    setIndexMetadata(undefined);
  }, [selectedConnection]);

  useEffect(() => {
    if (!selectedConnectionId || !selectedIndex) {
      indexFieldsRequestSeqRef.current += 1;
      indexMetadataRequestSeqRef.current += 1;
      setLoadingIndexMetadata(false);
      setIndexFields([]);
      setIndexMetadata(undefined);
      setFilters((current) =>
        current.map((item) => ({
          ...item,
          field: ''
        }))
      );
      return;
    }

    void loadIndexFields(selectedConnectionId, selectedIndex);
    void loadIndexMetadata(selectedConnectionId, selectedIndex);
  }, [selectedConnectionId, selectedIndex]);

  function resetQueryControls(): void {
    setKeyword('');
    setFilters([createFilter()]);
    setFilterJoinMode('and');
    setSize(50);
    setCurrentPage(1);
    setQueryPanelCollapsed(false);
  }

  function getApi() {
    if (!window.esApi) {
      throw new Error('桌面桥接未加载，请重启应用');
    }

    return window.esApi;
  }

  async function loadConnections(): Promise<void> {
    try {
      const data = await getApi().listConnections();
      setConnections(data);

      if (!selectedConnectionId && data[0]) {
        setSelectedConnectionId(data[0].id);
      }
    } catch (error) {
      showError(error, '读取本地连接配置失败');
    }
  }

  async function handleSaveConnection(payload: ConnectionInput): Promise<void> {
    try {
      const data = await getApi().saveConnection(payload);
      setConnections(data);
      const nextId = payload.id ?? data.find((item) => item.name === payload.name && item.nodeUrl === payload.nodeUrl)?.id;
      if (nextId) {
        if (nextId !== selectedConnectionId) {
          clearSearchResult();
          clearDslState(buildDefaultDslRequest());
        }
        setSelectedConnectionId(nextId);
      }
      showAppNotification({
        id: 'connection-saved',
        color: 'pink',
        title: '连接已保存',
        message: '本地配置更新成功'
      });
    } catch (error) {
      showError(error, '保存连接失败');
      throw error;
    }
  }

  async function handleDeleteConnection(connection: ConnectionConfig): Promise<void> {
    if (!window.confirm(`确定删除连接「${connection.name}」吗？`)) {
      return;
    }

    try {
      const data = await getApi().deleteConnection(connection.id);
      setConnections(data);
      if (selectedConnectionId === connection.id) {
        setSelectedConnectionId(data[0]?.id);
        setSelectedIndex(undefined);
        setIndices([]);
        clearSearchResult();
        clearDslState(buildDefaultDslRequest());
      }
      showAppNotification({
        id: 'connection-deleted',
        color: 'pink',
        title: '连接已删除',
        message: '本地配置已移除'
      });
    } catch (error) {
      showError(error, '删除连接失败');
    }
  }

  async function loadIndices(connection: ConnectionConfig): Promise<void> {
    const requestId = ++indicesRequestSeqRef.current;
    setLoadingIndices(true);
    try {
      const testResult = await getApi().testConnection(connection.id);
      if (requestId !== indicesRequestSeqRef.current) {
        return;
      }

      if (!testResult.success) {
        showAppNotification({
          id: 'connection-test',
          color: 'red',
          title: '连接失败',
          message: normalizeConnectionTestMessage(testResult.message),
          autoClose: 2600
        });
        return;
      }

      const data = await getApi().getIndices(connection.id);
      if (requestId !== indicesRequestSeqRef.current) {
        return;
      }

      setIndices(data);
      setSelectedIndex((current) => (current && data.some((item) => item.name === current) ? current : data[0]?.name));
      showAppNotification({
        id: 'connection-test',
        color: 'pink',
        title: '连接成功',
        message: `${testResult.clusterName || 'ES 集群'} · ${testResult.version || '未知版本'}`
      });
    } catch (error) {
      if (requestId !== indicesRequestSeqRef.current) {
        return;
      }
      showError(error, '读取索引失败');
    } finally {
      if (requestId === indicesRequestSeqRef.current) {
        setLoadingIndices(false);
      }
    }
  }

  async function loadIndexFields(connectionId: string, index: string): Promise<void> {
    const requestId = ++indexFieldsRequestSeqRef.current;
    try {
      const fields = await getApi().getIndexFields(connectionId, index);
      if (requestId !== indexFieldsRequestSeqRef.current) {
        return;
      }

      setIndexFields(fields);
    } catch (error) {
      if (requestId !== indexFieldsRequestSeqRef.current) {
        return;
      }
      showError(error, '读取索引字段失败');
    }
  }

  async function loadIndexMetadata(connectionId: string, index: string): Promise<void> {
    const requestId = ++indexMetadataRequestSeqRef.current;
    setLoadingIndexMetadata(true);
    try {
      const metadata = await getApi().getIndexMetadata(connectionId, index);
      if (requestId !== indexMetadataRequestSeqRef.current) {
        return;
      }

      setIndexMetadata(metadata);
    } catch (error) {
      if (requestId !== indexMetadataRequestSeqRef.current) {
        return;
      }
      setIndexMetadata(undefined);
      showError(error, '读取索引信息失败');
    } finally {
      if (requestId === indexMetadataRequestSeqRef.current) {
        setLoadingIndexMetadata(false);
      }
    }
  }

  function clearSearchResult(): void {
    searchRequestSeqRef.current += 1;
    setQuerying(false);
    setDocuments([]);
    setRows([]);
    setDirtyState({});
    setSelectedRowKey(undefined);
    setCheckedRowKeys([]);
    setSearchTotal(0);
    setCurrentPage(1);
    setQueryPanelCollapsed(false);
  }

  function clearDslState(nextRequest = buildDefaultDslRequest()): void {
    dslRequestSeqRef.current += 1;
    setDslExecuting(false);
    setDslRequest(nextRequest);
    setDslResponse('');
    setDslStatusCode(undefined);
  }

  function handleEnterDslWorkspace(): void {
    setWorkspaceMode('dsl');
    setDetailCollapsed(true);
    clearDslState(buildDefaultDslRequest(selectedIndex));
  }

  function handleExitDslWorkspace(): void {
    setWorkspaceMode('table');
    setQueryPanelCollapsed(false);
  }

  async function handleSearch(
    targetPage = 1,
    options?: {
      preserveDraftRows?: GridRow[];
      connectionId?: string;
      index?: string;
      mode?: 'keyword';
      keyword?: string;
      filters?: QueryFilter[];
      filterJoinMode?: FilterJoinMode;
      size?: number;
      collapseSidebar?: boolean;
      collapseQueryPanel?: boolean;
    }
  ): Promise<void> {
    const effectiveConnectionId = options?.connectionId ?? selectedConnectionId;
    const effectiveIndex = options?.index ?? selectedIndex;
    const effectiveMode = options?.mode ?? 'keyword';
    const effectiveKeyword = options?.keyword ?? keyword;
    const effectiveFilters = options?.filters ?? filters;
    const effectiveFilterJoinMode = options?.filterJoinMode ?? filterJoinMode;
    const effectiveSize = options?.size ?? size;

    if (!effectiveConnectionId) {
      showAppNotification({
        id: 'search-guard',
        color: 'yellow',
        title: '请先选择连接',
        message: '连接成功后才能查询文档'
      });
      return;
    }

    if (!effectiveIndex) {
      showAppNotification({
        id: 'search-guard',
        color: 'yellow',
        title: '请先选择索引',
        message: '左侧索引列表中点选一个索引'
      });
      return;
    }

    if (options?.collapseSidebar) {
      setSidebarCollapsed(true);
    }

    const requestId = ++searchRequestSeqRef.current;
    setQuerying(true);
    try {
      const safePage = Math.max(1, targetPage);
      const preservedDraftRows = options?.preserveDraftRows ?? draftRows;
      const result = await getApi().searchDocuments({
        connectionId: effectiveConnectionId,
        index: effectiveIndex,
        mode: effectiveMode,
        keyword: effectiveKeyword,
        filters: effectiveFilters,
        filterJoinMode: effectiveFilterJoinMode,
        size: effectiveSize,
        from: (safePage - 1) * effectiveSize
      });
      if (requestId !== searchRequestSeqRef.current) {
        return;
      }

      const fields = collectFieldNames(result.documents);
      const nextRows = [...preservedDraftRows, ...toGridRows(result.documents, fields)];

      setDocuments(result.documents);
      setRows(nextRows);
      setDirtyState({});
      setSelectedRowKey((current) => {
        if (current && preservedDraftRows.some((row) => row._rowKey === current)) {
          return current;
        }
        return nextRows[0]?._rowKey;
      });
      setCheckedRowKeys((current) =>
        current.filter((rowKey) => preservedDraftRows.some((row) => row._rowKey === rowKey))
      );
      setSearchTotal(result.total);
      setCurrentPage(safePage);
      if (effectiveSize !== size) {
        setSize(effectiveSize);
      }
      if (options?.collapseQueryPanel !== false) {
        setQueryPanelCollapsed(true);
      }

      showAppNotification({
        id: 'search-complete',
        color: 'pink',
        title: '查询完成',
        message: `第 ${safePage} 页 · 已加载 ${result.documents.length} 条文档`
      });
    } catch (error) {
      if (requestId !== searchRequestSeqRef.current) {
        return;
      }
      showError(error, '查询失败');
    } finally {
      if (requestId === searchRequestSeqRef.current) {
        setQuerying(false);
      }
    }
  }

  async function handleExecuteDsl(): Promise<void> {
    if (!selectedConnectionId) {
      showAppNotification({
        id: 'dsl-guard',
        color: 'yellow',
        title: '请先选择连接',
        message: '连接成功后才能执行 DSL 请求'
      });
      return;
    }

    let parsedRequest: ReturnType<typeof parseDslRequestText>;

    try {
      parsedRequest = parseDslRequestText(dslRequest);
    } catch (error) {
      showError(error, 'DSL 请求格式不正确');
      return;
    }

    const requestId = ++dslRequestSeqRef.current;
    setDslExecuting(true);
    try {
      const result = await getApi().executeDslRequest({
        connectionId: selectedConnectionId,
        ...parsedRequest
      });
      if (requestId !== dslRequestSeqRef.current) {
        return;
      }

      setDslStatusCode(result.statusCode);
      setDslResponse(result.responseBody);
      showAppNotification({
        id: 'dsl-complete',
        color: result.statusCode >= 400 ? 'yellow' : 'pink',
        title: result.statusCode >= 400 ? 'DSL 执行完成（返回错误）' : 'DSL 执行成功',
        message: `${parsedRequest.method} ${parsedRequest.path} · HTTP ${result.statusCode}`,
        autoClose: 2200
      });
    } catch (error) {
      if (requestId !== dslRequestSeqRef.current) {
        return;
      }
      setDslStatusCode(undefined);
      setDslResponse('');
      showError(error, 'DSL 执行失败');
    } finally {
      if (requestId === dslRequestSeqRef.current) {
        setDslExecuting(false);
      }
    }
  }

  function handleClearDsl(): void {
    clearDslState(buildDefaultDslRequest(selectedIndex));
  }

  async function handleSaveChanges(): Promise<void> {
    if (!selectedConnectionId || !selectedIndex) {
      return;
    }

    const createValidations: string[] = [];
    const createTasks = draftRows.flatMap((row) => {
      const documentId = String(row._id ?? '').trim();

      try {
        const document = buildDocumentFromGridRow(row, displayFields, fieldTypeMap);
        if (Object.keys(document).length === 0) {
          createValidations.push(documentId ? `新增文档 ${documentId} 至少要填写一个字段` : '新增文档至少要填写一个字段');
          return [];
        }

        return [
          {
            rowKey: row._rowKey,
            id: documentId || undefined,
            document,
            task: getApi().createDocument({
              connectionId: selectedConnectionId,
              index: selectedIndex,
              id: documentId || undefined,
              document: document as Record<string, import('../../shared/types').PrimitiveValue>
            })
          }
        ];
      } catch (error) {
        const message = error instanceof Error ? error.message : '格式不正确';
        createValidations.push(documentId ? `新增文档 ${documentId}: ${message}` : `新增文档: ${message}`);
        return [];
      }
    });

    const updateTasks = Object.entries(dirtyState).map(([documentId, changes]) =>
      getApi().updateDocument({
        connectionId: selectedConnectionId,
        index: selectedIndex,
        id: documentId,
        changes
      })
    );

    if (updateTasks.length === 0 && createTasks.length === 0) {
      if (createValidations.length > 0) {
        showAppNotification({
          id: 'save-result',
          color: 'red',
          title: '保存失败',
          message: createValidations.join('；'),
          autoClose: 2600
        });
      }
      return;
    }

    setSaving(true);
    try {
      const updateResults = await Promise.all(updateTasks);
      const createResults = await Promise.all(createTasks.map((item) => item.task));
      const failedResults = [...updateResults, ...createResults].filter((item) => !item.success);
      const successIds = updateResults.filter((item) => item.success).map((item) => item.id);
      const successfulCreates = createTasks.filter((_, index) => createResults[index]?.success);

      if (successIds.length > 0) {
        setDirtyState((current) => {
          const nextState = { ...current };
          successIds.forEach((id) => {
            delete nextState[id];
          });
          return nextState;
        });

        setDocuments((current) =>
          current.map((document) => {
            const changes = dirtyState[document._id];
            if (!changes || !successIds.includes(document._id)) {
              return document;
            }

            return {
              ...document,
              _source: {
                ...applyChangesToDocumentSource(document._source, changes)
              }
            };
          })
        );
      }

      if (failedResults.length === 0 && createValidations.length === 0) {
      showAppNotification({
        id: 'save-result',
        color: 'pink',
        title: '保存成功',
        message: `已保存 ${updateResults.length + createResults.length} 条文档变更`
      });
      } else {
        const message = [...createValidations, ...failedResults.map(formatSaveError)].join('；');
        showAppNotification({
          id: 'save-result',
          color: 'red',
          title: '部分保存失败',
          message,
          autoClose: 2600
        });
      }

      if (successfulCreates.length > 0) {
        const successfulDraftKeys = new Set(successfulCreates.map((item) => item.rowKey));
        const remainingDraftRows = draftRows.filter((row) => !successfulDraftKeys.has(row._rowKey));
        await handleSearch(currentPage, {
          preserveDraftRows: remainingDraftRows
        });
      }
    } catch (error) {
      showError(error, '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDocument(): Promise<void> {
    if (!selectedConnectionId || !selectedIndex || checkedRowKeys.length === 0 || deleting || querying || saving) {
      return;
    }

    if (checkedDraftRows.length === 0 && checkedDocuments.length === 0) {
      return;
    }

    const checkedDocumentIds = checkedDocuments.map((item) => item._id);
    const checkedDraftRowKeys = new Set(checkedDraftRows.map((item) => item._rowKey));
    const unsavedDocumentCount = checkedDocumentIds.filter(
      (id) => dirtyState[id] && Object.keys(dirtyState[id]).length > 0
    ).length;
    const confirmed = window.confirm(
      [
        `确定删除当前索引「${selectedIndex}」下已勾选的 ${checkedRowKeys.length} 项内容吗？`,
        '此操作不可恢复。',
        checkedDocuments.length > 0 ? `包含 ${checkedDocuments.length} 条文档。` : '未勾选已保存文档。',
        checkedDraftRows.length > 0 ? `包含 ${checkedDraftRows.length} 条草稿行，未保存内容会直接丢失。` : '未勾选草稿行。',
        unsavedDocumentCount > 0
          ? `${unsavedDocumentCount} 条文档存在未保存修改，这些修改会一并丢弃。`
          : '若勾选文档存在未保存修改，这些修改会一并丢弃。'
      ].join('\n')
    );

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    try {
      const deleteResults = await Promise.all(
        checkedDocuments.map((document) =>
          getApi().deleteDocument({
            connectionId: selectedConnectionId,
            index: selectedIndex,
            id: document._id
          })
        )
      );
      const successfulDocumentIds = new Set(
        deleteResults.filter((item) => item.success).map((item) => item.id)
      );
      const failedResults = deleteResults.filter((item) => !item.success);
      const removedRowKeys = new Set<string>(checkedDraftRowKeys);

      checkedDocuments.forEach((document) => {
        if (successfulDocumentIds.has(document._id)) {
          removedRowKeys.add(`${document._index}:${document._id}`);
        }
      });

      const nextDocuments = documents.filter((document) => !successfulDocumentIds.has(document._id));
      const nextRows = rows.filter((row) => !removedRowKeys.has(row._rowKey));
      const nextTotal = Math.max(searchTotal - successfulDocumentIds.size, 0);

      setDocuments(nextDocuments);
      setRows(nextRows);
      setDirtyState((current) => {
        const nextState = { ...current };
        successfulDocumentIds.forEach((id) => {
          delete nextState[id];
        });
        return nextState;
      });
      setCheckedRowKeys((current) => current.filter((rowKey) => !removedRowKeys.has(rowKey)));
      setSearchTotal(nextTotal);

      setSelectedRowKey((current) => {
        if (current && nextRows.some((row) => row._rowKey === current)) {
          return current;
        }
        return nextRows[0]?._rowKey;
      });

      const deletedDraftCount = checkedDraftRows.length;
      const deletedDocumentCount = successfulDocumentIds.size;
      const deletedTotal = deletedDraftCount + deletedDocumentCount;

      if (failedResults.length === 0) {
        showAppNotification({
          id: 'delete-result',
          color: 'pink',
          title: '删除成功',
          message: `已删除 ${deletedTotal} 项内容，其中包含 ${deletedDocumentCount} 条文档和 ${deletedDraftCount} 条草稿`
        });
      } else {
        const summary = failedResults
          .slice(0, 2)
          .map((item) => `${item.id}：${item.message ?? '删除失败'}`)
          .join('；');
        showAppNotification({
          id: 'delete-result',
          color: deletedTotal > 0 ? 'yellow' : 'red',
          title: deletedTotal > 0 ? '部分删除成功' : '删除失败',
          message:
            deletedTotal > 0
              ? `已删除 ${deletedTotal} 项，另有 ${failedResults.length} 条文档删除失败${summary ? `：${summary}` : ''}`
              : summary || '已勾选文档删除失败',
          autoClose: 3200
        });
      }

      if (nextRows.length === 0 && currentPage > 1 && successfulDocumentIds.size > 0) {
        await handleSearch(currentPage - 1, {
          preserveDraftRows: nextRows.filter((row) => row._isDraft)
        });
      }
    } catch (error) {
      showError(error, '删除失败');
    } finally {
      setDeleting(false);
    }
  }

  function handleRowsChange(nextRows: GridRow[]): void {
    if (!documents.length && !draftRows.length) {
      return;
    }

    const originalMap = documents.reduce<Record<string, EsDocument>>((accumulator, document) => {
      accumulator[document._id] = document;
      return accumulator;
    }, {});

    const nextDirtyState: DirtyState = {};

    nextRows.forEach((row) => {
      const original = originalMap[row._id];
      if (row._isDraft || !original) {
        return;
      }

      Object.keys(row).forEach((field) => {
        if (field.startsWith('_')) {
          return;
        }

        const nextValue = row[field];
        const primitiveOriginalValue = getPrimitiveValueByPath(original._source, field);
        const nextComparable = String(nextValue ?? '');
        const originalComparable = String(primitiveOriginalValue ?? '');
        const normalizedNextValue =
          nextValue === null || typeof nextValue === 'string' || typeof nextValue === 'number' || typeof nextValue === 'boolean'
            ? nextValue
            : String(nextValue);

        if (primitiveOriginalValue === undefined) {
          if (nextValue === '' || nextValue === undefined) {
            return;
          }

          nextDirtyState[row._id] = {
            ...(nextDirtyState[row._id] ?? {}),
            [field]: normalizedNextValue as import('../../shared/types').PrimitiveValue
          };
          return;
        }

        if (nextComparable !== originalComparable) {
          nextDirtyState[row._id] = {
            ...(nextDirtyState[row._id] ?? {}),
            [field]: normalizedNextValue as import('../../shared/types').PrimitiveValue
          };
        }
      });
    });

    setRows(nextRows);
    setDirtyState(nextDirtyState);
  }

  function showError(error: unknown, fallback: string): void {
    showAppNotification({
      id: 'global-error',
      color: 'red',
      title: fallback,
      message: error instanceof Error ? normalizeUiErrorMessage(error.message) : fallback,
      autoClose: 2800
    });
  }

  function handleSelectRow(rowKey: string): void {
    setSelectedRowKey(rowKey);
    setDetailTab('document');
  }

  function handleOpenIndexMetadata(tab: Exclude<DetailTab, 'document'> = 'settings'): void {
    if (!selectedIndex) {
      showAppNotification({
        id: 'index-detail-guard',
        color: 'yellow',
        title: '请先选择索引',
        message: '选择索引后才能查看 settings 和 mappings'
      });
      return;
    }

    if (!detailCollapsed && detailTab !== 'document') {
      setDetailCollapsed(true);
      return;
    }

    setDetailTab(tab);
    setDetailCollapsed(false);
  }

  function handleAddDraftRow(): void {
    if (!selectedConnectionId || !selectedIndex || querying || saving || deleting) {
      showAppNotification({
        id: 'add-draft-guard',
        color: 'yellow',
        title: '暂时不能新增',
        message: '请先选择连接和索引，并等待当前操作完成'
      });
      return;
    }

    const rowKey = `draft:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const draftRow: GridRow = {
      _rowKey: rowKey,
      _id: '',
      _isDraft: true
    };

    displayFields.forEach((field) => {
      draftRow[field] = '';
    });

    setRows((current) => [draftRow, ...current]);
    setSelectedRowKey(rowKey);
    setGridScrollToTopSignal((current) => current + 1);
    showAppNotification({
      id: 'add-draft',
      color: 'pink',
      title: '已新增空白行',
      message: '可选填写 _id；留空时会由 Elasticsearch 自动生成'
    });
  }

  function handleToggleDeleteCheck(rowKey: string, checked: boolean): void {
    setCheckedRowKeys((current) => {
      if (checked) {
        return current.includes(rowKey) ? current : [...current, rowKey];
      }

      return current.filter((item) => item !== rowKey);
    });
    if (checked) {
      setSelectedRowKey(rowKey);
    }
  }

  return (
    <>
      <AppShell
        header={{ height: headerHeight }}
        navbar={{ width: navbarWidth, breakpoint: 'lg' }}
        aside={detailCollapsed ? undefined : { width: asideWidth, breakpoint: 'xl' }}
        padding={shellPadding}
        className={[
          'app-shell',
          compactViewport ? 'app-shell-responsive' : '',
          narrowViewport ? 'app-shell-narrow' : ''
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <AppShell.Header className="app-header">
          <Group
            justify="space-between"
            align="center"
            h="100%"
            px={narrowViewport ? 'sm' : 'md'}
            className={compactHeader ? 'header-content header-content-compact' : 'header-content'}
          >
            <Group gap="sm" className="header-brand">
              <div className="brand-badge">
                <img src={appIcon} alt="Tiny ES Studio 图标" className="brand-badge-image" />
              </div>
              <Stack gap={1} className="header-brand-copy">
                <Text fw={800} size="lg" className="header-brand-title">
                  Tiny ES Studio
                </Text>
                <Group gap="xs" align="center" wrap="wrap" className="header-brand-meta">
                  <Text size="xs" c="dimmed" className="header-brand-subtitle">
                    {compactHeader ? 'Elasticsearch 小工具' : '可爱但专业的 Elasticsearch 小工具'}
                  </Text>
                </Group>
              </Stack>
            </Group>
            <Group gap={compactHeader ? 'xs' : 'sm'} className="header-actions">
              <div className="header-control-cluster">
                {selectedConnection ? (
                  <div className="header-connection-inline header-control-pill">
                    <span className="header-connection-caption">当前连接:</span>
                    <span className="header-connection-name">{selectedConnection.name}</span>
                  </div>
                ) : null}

                {selectedIndex ? (
                  <div className="header-connection-inline header-control-pill">
                    <span className="header-connection-caption">当前索引:</span>
                    <span className="header-connection-name">{selectedIndex}</span>
                  </div>
                ) : null}

                <Tooltip label={selectedConnection ? '重新测试连接并刷新索引' : '请先选择连接'} withArrow>
                  <UnstyledButton
                    type="button"
                    className="header-action-button header-action-button-icon"
                    disabled={!selectedConnection || loadingIndices}
                    aria-label="重新测试连接并刷新索引"
                    onClick={() => selectedConnection && void loadIndices(selectedConnection)}
                  >
                    {loadingIndices ? <Loader size={14} color="currentColor" /> : <IconPlugConnected size={16} />}
                  </UnstyledButton>
                </Tooltip>

                <Tooltip label={workspaceMode === 'dsl' ? '返回表格' : 'DSL 控制台'} withArrow>
                  <UnstyledButton
                    type="button"
                    className="header-action-button header-action-button-icon"
                    aria-label={workspaceMode === 'dsl' ? '返回表格' : 'DSL 控制台'}
                    onClick={workspaceMode === 'dsl' ? handleExitDslWorkspace : handleEnterDslWorkspace}
                  >
                    {workspaceMode === 'dsl' ? <IconTable size={16} /> : <IconTerminal2 size={16} />}
                  </UnstyledButton>
                </Tooltip>

                <Tooltip label={themeMode === 'dark' ? '切回浅色模式' : '切换暗黑模式'} withArrow>
                  <UnstyledButton
                    type="button"
                    className="header-action-button header-action-button-icon"
                    aria-label={themeMode === 'dark' ? '切回浅色模式' : '切换暗黑模式'}
                    onClick={onToggleTheme}
                  >
                    {themeMode === 'dark' ? <IconSunHigh size={16} /> : <IconMoonStars size={16} />}
                  </UnstyledButton>
                </Tooltip>

                <Tooltip label="关于 Tiny ES Studio" withArrow>
                  <UnstyledButton
                    type="button"
                    className="header-action-button header-action-button-icon"
                    aria-label="关于 Tiny ES Studio"
                    onClick={() => setAboutOpened(true)}
                  >
                    <IconInfoCircle size={16} />
                  </UnstyledButton>
                </Tooltip>
              </div>
            </Group>
          </Group>
        </AppShell.Header>

        <Modal
          opened={aboutOpened}
          onClose={() => setAboutOpened(false)}
          centered
          radius="xl"
          title="关于 Tiny ES Studio"
          classNames={{
            content: 'about-modal-content',
            header: 'about-modal-header',
            title: 'about-modal-title',
            body: 'about-modal-body',
            close: 'about-modal-close'
          }}
          overlayProps={{ backgroundOpacity: themeMode === 'dark' ? 0.68 : 0.34, blur: 16 }}
        >
          <Stack gap="lg">
            <Group gap="md" align="flex-start" wrap="nowrap" className="about-modal-hero">
              <div className="about-modal-badge">
                <img src={appIcon} alt="Tiny ES Studio 图标" className="brand-badge-image" />
              </div>
              <Stack gap={4} className="about-modal-copy">
                <Text className="about-modal-name">Tiny ES Studio</Text>
                <Text className="about-modal-subtitle">可爱但专业的 Elasticsearch 小工具</Text>
                <Text className="about-modal-meta">
                  版本 {APP_VERSION} · 作者 {APP_AUTHOR}
                </Text>
              </Stack>
            </Group>

            <div className="about-modal-panel">
              <Text className="about-modal-description">
                为个人开发者准备的轻量 Elasticsearch 桌面工作台，支持表格查询与编辑、DSL 控制台、索引设置和映射查看。
              </Text>
            </div>
          </Stack>
        </Modal>

        <AppShell.Navbar className={sidebarCollapsed ? 'app-navbar app-navbar-collapsed' : 'app-navbar'}>
          {sidebarCollapsed ? (
            <div className="sidebar-rail">
              <UnstyledButton
                className="sidebar-rail-toggle"
                aria-label="展开左侧面板"
                onClick={() => setSidebarCollapsed(false)}
              >
                <IconChevronRight size={16} />
              </UnstyledButton>
            </div>
          ) : (
            <div className="sidebar-expanded-shell">
              <ConnectionSidebar
                connections={connections}
                selectedConnectionId={selectedConnectionId}
                selectedIndex={selectedIndex}
                indices={indices}
                loadingIndices={loadingIndices}
                editorOpened={editorOpened}
                editingConnection={editingConnection}
                onSelectConnection={(connection) => {
                  setSelectedConnectionId(connection.id);
                  setSelectedIndex(undefined);
                  setIndices([]);
                  resetQueryControls();
                  clearSearchResult();
                  clearDslState(buildDefaultDslRequest());
                }}
                onAddConnection={() => {
                  setEditingConnection(null);
                  setEditorOpened(true);
                }}
                onEditConnection={(connection) => {
                  setEditingConnection(connection);
                  setEditorOpened(true);
                }}
                onDeleteConnection={(connection) => {
                  void handleDeleteConnection(connection);
                }}
                onSelectIndex={(indexName) => {
                  const nextFilters = [createFilter()];
                  setSelectedIndex(indexName);
                  clearSearchResult();
                  setSidebarCollapsed(true);
                  if (workspaceMode === 'table') {
                    setKeyword('');
                    setFilters(nextFilters);
                    setSize(50);
                    setCurrentPage(1);
                    showAppNotification({
                      id: 'index-switched',
                      color: 'pink',
                      title: '已切换索引',
                      message: `正在加载 ${indexName} 的前 50 条文档`
                    });
                  } else {
                    setDslRequest(buildDefaultDslRequest(indexName));
                    setDslResponse('');
                    setDslStatusCode(undefined);
                    showAppNotification({
                      id: 'index-switched',
                      color: 'pink',
                      title: '已切换索引',
                      message: `当前 DSL 模式不会自动查询，已切换到 ${indexName}`
                    });
                  }

                  if (selectedConnectionId && workspaceMode === 'table') {
                    void handleSearch(1, {
                      connectionId: selectedConnectionId,
                      index: indexName,
                      mode: 'keyword',
                      keyword: '',
                      filters: nextFilters,
                      size: 50,
                      preserveDraftRows: [],
                      collapseSidebar: true
                    });
                  }
                }}
                onCloseEditor={() => {
                  setEditorOpened(false);
                  setEditingConnection(null);
                }}
                onSubmitConnection={handleSaveConnection}
              />
              <UnstyledButton
                className="sidebar-collapse-handle"
                aria-label="收起左侧面板"
                onClick={() => setSidebarCollapsed(true)}
              >
                <IconChevronLeft size={16} />
              </UnstyledButton>
            </div>
          )}
        </AppShell.Navbar>

        {workspaceMode === 'table' && !detailCollapsed ? (
          <AppShell.Aside className="app-aside">
            <JsonDetailPanel
              document={selectedDocument}
              selectedIndex={selectedIndex}
              metadata={indexMetadata}
              loadingMetadata={loadingIndexMetadata}
              activeTab={detailTab}
              onChangeTab={setDetailTab}
              collapsed={detailCollapsed}
              onToggleCollapse={() => setDetailCollapsed((value) => !value)}
            />
          </AppShell.Aside>
        ) : null}

        <AppShell.Main className="app-main">
          {workspaceMode === 'table' ? (
            <Stack gap={narrowViewport ? 'xs' : 'sm'} h={mainViewportHeight} className="main-stack">
              <Card
                radius="xl"
                p={0}
                className={compactResultsLayout ? 'grid-card results-card results-card-compact' : 'grid-card results-card'}
                style={compactResultsLayout ? undefined : { flex: 1 }}
              >
                <div className="grid-toolbar-row">
                  <div className="grid-toolbar-inline">
                    <Group gap="sm" align="center" wrap="wrap" className="grid-toolbar-summary">
                      <Text fw={700} className="grid-toolbar-title">查询结果</Text>
                      {rows.length > 0 ? (
                        <>
                          <Text size="sm" c="dimmed" className="grid-toolbar-count">
                            共 {searchTotal} 条
                          </Text>
                        </>
                      ) : (
                        <Text size="sm" c="dimmed">
                          结果会以表格方式展示，单击单元格即可编辑。
                        </Text>
                      )}
                    </Group>

                    <div className="grid-toolbar-leading">
                      {rows.length > 0 ? (
                        <Group gap="xs" align="center" wrap="nowrap" className="grid-pagination-controls">
                          <Tooltip label="回到第一页" withArrow>
                            <ActionIcon
                              size={32}
                              radius="xl"
                              variant="transparent"
                              aria-label="回到第一页"
                              disabled={currentPage <= 1 || querying}
                              className="grid-toolbar-icon-button grid-pagination-icon-button"
                              onClick={() => void handleSearch(1)}
                            >
                              <IconChevronsLeft size={15} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="上一页" withArrow>
                            <ActionIcon
                              size={32}
                              radius="xl"
                              variant="transparent"
                              aria-label="上一页"
                              disabled={currentPage <= 1 || querying}
                              className="grid-toolbar-icon-button grid-pagination-icon-button"
                              onClick={() => void handleSearch(currentPage - 1)}
                            >
                              <IconChevronLeft size={15} />
                            </ActionIcon>
                          </Tooltip>
                          <div className="grid-pagination-status" aria-label={`第 ${currentPage} 页，共 ${totalPages} 页`}>
                            <span className="grid-pagination-status-label">第</span>
                            <span className="grid-pagination-status-value">{currentPage}</span>
                            <span className="grid-pagination-status-separator">/</span>
                            <span className="grid-pagination-status-value">{totalPages}</span>
                            <span className="grid-pagination-status-label">页</span>
                          </div>
                          <Tooltip label="下一页" withArrow>
                            <ActionIcon
                              size={32}
                              radius="xl"
                              variant="transparent"
                              aria-label="下一页"
                              disabled={currentPage >= totalPages || querying}
                              className="grid-toolbar-icon-button grid-pagination-icon-button"
                              onClick={() => void handleSearch(currentPage + 1)}
                            >
                              <IconChevronRight size={15} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label="跳到末页" withArrow>
                            <ActionIcon
                              size={32}
                              radius="xl"
                              variant="transparent"
                              aria-label="跳到末页"
                              disabled={currentPage >= totalPages || querying}
                              className="grid-toolbar-icon-button grid-pagination-icon-button"
                              onClick={() => void handleSearch(totalPages)}
                            >
                              <IconChevronsRight size={15} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      ) : (
                        <div className="grid-toolbar-pagination-placeholder" />
                      )}
                    </div>

                    <Group gap="xs" align="center" wrap="nowrap" className="grid-toolbar-trailing">
                      <Tooltip label="新增一行" withArrow>
                        <ActionIcon
                          size={34}
                          radius="xl"
                          variant="transparent"
                          color="pink"
                          disabled={!selectedConnectionId || !selectedIndex || querying || saving || deleting}
                          className="grid-toolbar-icon-button grid-toolbar-icon-button-add"
                          onClick={handleAddDraftRow}
                        >
                          <IconPlus size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label={canSave ? '保存新增文档和已修改字段' : '还没有可保存的内容'} withArrow>
                        <ActionIcon
                          size={34}
                          radius="xl"
                          variant="transparent"
                          loading={saving}
                          disabled={!canSave}
                          className="grid-toolbar-icon-button grid-toolbar-icon-button-save"
                          onClick={() => void handleSaveChanges()}
                        >
                          <IconDeviceFloppy size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip
                        label={canDelete ? `批量删除已勾选内容（${checkedRowKeys.length}）` : '请先勾选要删除的文档'}
                        withArrow
                      >
                        <ActionIcon
                          size={34}
                          radius="xl"
                          variant="transparent"
                          color="red"
                          loading={deleting}
                          disabled={!canDelete}
                          className="grid-toolbar-icon-button grid-toolbar-icon-button-danger"
                          onClick={() => void handleDeleteDocument()}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Button
                        size="xs"
                        variant="subtle"
                        color="gray"
                        className="grid-toolbar-detail-button"
                        onClick={() => setDetailCollapsed((value) => !value)}
                        leftSection={
                          detailCollapsed ? (
                            <IconLayoutSidebarRightExpand size={15} />
                          ) : (
                            <IconLayoutSidebarRightCollapse size={15} />
                          )
                        }
                      >
                        {narrowViewport ? '详情' : detailCollapsed ? '展开详情' : '收起详情'}
                      </Button>
                    </Group>
                  </div>
                </div>
                {rows.length > 0 ? (
                  <DocumentsGrid
                    compact={compactResultsLayout}
                    fields={displayFields}
                    rows={rows}
                    documents={documents}
                    dirtyState={dirtyState}
                    selectedRowKey={selectedRowKey}
                    checkedRowKeys={checkedRowKeys}
                    fieldTypeMap={fieldTypeMap}
                    fieldFormatMap={fieldFormatMap}
                    fieldDateFormatHintMap={fieldDateFormatHintMap}
                    scrollToTopSignal={gridScrollToTopSignal}
                    onRowsChange={(nextRows) => handleRowsChange(nextRows)}
                    onSelectRow={handleSelectRow}
                    onToggleDeleteCheck={handleToggleDeleteCheck}
                  />
                ) : (
                  <Stack justify="center" align="center" h="100%" gap="sm">
                    <Text fw={700} size="lg">
                      先选连接、加载索引，再发起一次查询
                    </Text>
                    <Text c="dimmed" size="sm">
                      这里会以接近 Excel 的方式展示 Elasticsearch 文档，并支持直接编辑。
                    </Text>
                  </Stack>
                )}
              </Card>
              <QueryToolbar
                selectedConnection={selectedConnection}
                selectedIndex={selectedIndex}
                collapsed={queryPanelCollapsed}
                keyword={keyword}
                filters={filters}
                filterJoinMode={filterJoinMode}
                indexFields={indexFields}
                size={size}
                querying={querying}
                loadingIndexMetadata={loadingIndexMetadata}
                dirtyCount={dirtyCount}
                total={searchTotal}
                compactMode={compactViewport}
                onChangeKeyword={setKeyword}
                onAddFilter={() => setFilters((current) => [...current, createFilter()])}
                onClearFilters={() => {
                  setFilters([createFilter()]);
                  setFilterJoinMode('and');
                }}
                onChangeFilterJoinMode={setFilterJoinMode}
                onUpdateFilter={(id, patch) =>
                  setFilters((current) =>
                    current.map((item) => (item.id === id ? { ...item, ...patch } : item))
                  )
                }
                onRemoveFilter={(id) =>
                  setFilters((current) => {
                    if (current.length === 1) {
                      return current;
                    }
                    return current.filter((item) => item.id !== id);
                  })
                }
                onChangeSize={setSize}
                onSearch={() => void handleSearch(1, { collapseSidebar: true })}
                onRefresh={() => void handleSearch(currentPage)}
                onReset={resetQueryControls}
                onOpenIndexMetadata={() => handleOpenIndexMetadata('settings')}
                onToggleCollapsed={() => setQueryPanelCollapsed((current) => !current)}
              />
            </Stack>
          ) : (
            <div className="dsl-main-shell" style={{ height: mainViewportHeight }}>
              <DslWorkspace
                selectedIndex={selectedIndex}
                availableIndices={indices.map((item) => item.name)}
                fieldOptions={indexFields}
                themeMode={themeMode}
                dslRequest={dslRequest}
                dslResponse={dslResponse}
                dslStatusCode={dslStatusCode}
                dslExecuting={dslExecuting}
                onChangeDslRequest={setDslRequest}
                onExecuteDsl={() => void handleExecuteDsl()}
                onClearDsl={handleClearDsl}
              />
          </div>
        )}
        </AppShell.Main>
      </AppShell>
    </>
  );
}

function formatSaveError(item: SaveDocumentResult): string {
  const label = item.id || '未指定 _id 的文档';
  return `${label}: ${item.message ?? '未知错误'}`;
}

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') {
      return 'light';
    }

    const savedThemeMode = window.localStorage.getItem(THEME_STORAGE_KEY);
    return savedThemeMode === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    document.documentElement.dataset.appTheme = themeMode;
    document.body.dataset.appTheme = themeMode;
  }, [themeMode]);

  return (
    <MantineProvider theme={theme} defaultColorScheme="light" forceColorScheme={themeMode}>
      <Notifications position="top-right" limit={1} />
      <ErrorBoundary>
        <AppContent themeMode={themeMode} onToggleTheme={() => setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'))} />
      </ErrorBoundary>
    </MantineProvider>
  );
}
