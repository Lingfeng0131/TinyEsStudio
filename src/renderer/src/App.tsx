import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  AppShell,
  Button,
  Card,
  Group,
  MantineProvider,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
  createTheme
} from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import {
  IconDeviceFloppy,
  IconPlus,
  IconChevronsLeft,
  IconChevronsRight,
  IconChevronLeft,
  IconChevronRight,
  IconHeartHandshake,
  IconLayoutSidebarRightCollapse,
  IconLayoutSidebarRightExpand,
  IconPlugConnected,
  IconTrash
} from '@tabler/icons-react';
import type {
  ConnectionConfig,
  ConnectionInput,
  EsDocument,
  IndexFieldOption,
  IndexSummary,
  QueryFilter,
  QueryMode,
  SaveDocumentResult
} from '../../shared/types';
import { ConnectionSidebar } from './components/ConnectionSidebar';
import { DocumentsGrid } from './components/DocumentsGrid';
import { ErrorBoundary } from './components/ErrorBoundary';
import { JsonDetailPanel } from './components/JsonDetailPanel';
import { QueryToolbar } from './components/QueryToolbar';
import type { DirtyState, GridRow } from './types';
import {
  applyChangesToDocumentSource,
  buildDocumentFromGridRow,
  collectFieldNames,
  getPrimitiveValueByPath,
  normalizeCellValue,
  toGridRows
} from './utils/documentTable';

const theme = createTheme({
  primaryColor: 'pink',
  fontFamily: '"Nunito", "PingFang SC", "Microsoft YaHei", sans-serif',
  defaultRadius: 'xl',
  colors: {
    pink: ['#fff0f4', '#ffe0ea', '#ffcade', '#ffb1cf', '#ff95bc', '#ff7eae', '#ff6ca4', '#ef4b8a', '#d93a79', '#b32866'],
    blue: ['#eef6ff', '#daeaff', '#bfdcff', '#9ac7ff', '#72afff', '#529aff', '#3f8eff', '#2477ea', '#1763d0', '#0a4ca9'],
    mint: ['#eefaf7', '#dcf2eb', '#bce7da', '#95dbc7', '#6ccfb4', '#50c7a7', '#41c39f', '#2dae88', '#1e9776', '#107e63']
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

const defaultJsonQuery = '{\n  "query": {\n    "match_all": {}\n  }\n}';

function showAppNotification(options: {
  id: string;
  color: string;
  title: string;
  message: string;
  autoClose?: number;
}): void {
  notifications.hide(options.id);
  notifications.show({
    ...options,
    autoClose: options.autoClose ?? 1800
  });
}

function AppContent() {
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
  const [loadingIndices, setLoadingIndices] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [queryMode, setQueryMode] = useState<QueryMode>('keyword');
  const [keyword, setKeyword] = useState('');
  const [jsonQuery, setJsonQuery] = useState('{\n  "query": {\n    "match_all": {}\n  }\n}');
  const [filters, setFilters] = useState<QueryFilter[]>([createFilter()]);
  const [size, setSize] = useState(50);
  const [documents, setDocuments] = useState<EsDocument[]>([]);
  const [rows, setRows] = useState<GridRow[]>([]);
  const [dirtyState, setDirtyState] = useState<DirtyState>({});
  const [selectedRowKey, setSelectedRowKey] = useState<string>();
  const [checkedRowKey, setCheckedRowKey] = useState<string>();
  const [gridScrollToTopSignal, setGridScrollToTopSignal] = useState(0);
  const [editorOpened, setEditorOpened] = useState(false);
  const [editingConnection, setEditingConnection] = useState<ConnectionConfig | null>(null);
  const [searchTotal, setSearchTotal] = useState(0);
  const [detailCollapsed, setDetailCollapsed] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [queryPanelCollapsed, setQueryPanelCollapsed] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1440 : window.innerWidth
  );

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

  const checkedDocument = useMemo(
    () => documents.find((item) => `${item._index}:${item._id}` === checkedRowKey),
    [checkedRowKey, documents]
  );

  const checkedDraftRow = useMemo(
    () => rows.find((item) => item._rowKey === checkedRowKey && item._isDraft),
    [checkedRowKey, rows]
  );

  const fieldTypeMap = useMemo(
    () =>
      indexFields.reduce<Record<string, string>>((accumulator, field) => {
        accumulator[field.name] = field.type;
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
      Boolean(selectedRowKey) &&
      selectedRowKey === checkedRowKey &&
      Boolean(selectedDocument || checkedDraftRow) &&
      !querying &&
      !saving &&
      !deleting,
    [checkedDraftRow, checkedRowKey, deleting, querying, saving, selectedDocument, selectedRowKey]
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

    if (viewportWidth < 1200 && !queryPanelCollapsed) {
      setQueryPanelCollapsed(true);
    }
  }, [queryPanelCollapsed, sidebarCollapsed, viewportWidth]);

  useEffect(() => {
    void loadConnections();
  }, []);

  useEffect(() => {
    if (selectedConnection) {
      void loadIndices(selectedConnection);
      return;
    }

    setIndices([]);
    setSelectedIndex(undefined);
    setIndexFields([]);
  }, [selectedConnection]);

  useEffect(() => {
    if (!selectedConnectionId || !selectedIndex) {
      setIndexFields([]);
      setFilters((current) =>
        current.map((item) => ({
          ...item,
          field: ''
        }))
      );
      return;
    }

    void loadIndexFields(selectedConnectionId, selectedIndex);
  }, [selectedConnectionId, selectedIndex]);

  function resetQueryControls(): void {
    setQueryMode('keyword');
    setKeyword('');
    setJsonQuery(defaultJsonQuery);
    setFilters([createFilter()]);
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
        setSelectedConnectionId(nextId);
      }
      showAppNotification({
        id: 'connection-saved',
        color: 'mint',
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
      }
      showAppNotification({
        id: 'connection-deleted',
        color: 'mint',
        title: '连接已删除',
        message: '本地配置已移除'
      });
    } catch (error) {
      showError(error, '删除连接失败');
    }
  }

  async function loadIndices(connection: ConnectionConfig): Promise<void> {
    setLoadingIndices(true);
    try {
      const testResult = await getApi().testConnection(connection.id);
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
      setIndices(data);
      setSelectedIndex((current) => (current && data.some((item) => item.name === current) ? current : data[0]?.name));
      showAppNotification({
        id: 'connection-test',
        color: 'mint',
        title: '连接成功',
        message: `${testResult.clusterName || 'ES 集群'} · ${testResult.version || '未知版本'}`
      });
    } catch (error) {
      showError(error, '读取索引失败');
    } finally {
      setLoadingIndices(false);
    }
  }

  async function loadIndexFields(connectionId: string, index: string): Promise<void> {
    try {
      const fields = await getApi().getIndexFields(connectionId, index);
      setIndexFields(fields);
    } catch (error) {
      showError(error, '读取索引字段失败');
    }
  }

  function clearSearchResult(): void {
    setDocuments([]);
    setRows([]);
    setDirtyState({});
    setSelectedRowKey(undefined);
    setCheckedRowKey(undefined);
    setSearchTotal(0);
    setCurrentPage(1);
    setQueryPanelCollapsed(false);
  }

  async function handleSearch(
    targetPage = 1,
    options?: {
      preserveDraftRows?: GridRow[];
      connectionId?: string;
      index?: string;
      mode?: QueryMode;
      keyword?: string;
      jsonQuery?: string;
      filters?: QueryFilter[];
      size?: number;
      collapseSidebar?: boolean;
      collapseQueryPanel?: boolean;
    }
  ): Promise<void> {
    const effectiveConnectionId = options?.connectionId ?? selectedConnectionId;
    const effectiveIndex = options?.index ?? selectedIndex;
    const effectiveMode = options?.mode ?? queryMode;
    const effectiveKeyword = options?.keyword ?? keyword;
    const effectiveJsonQuery = options?.jsonQuery ?? jsonQuery;
    const effectiveFilters = options?.filters ?? filters;
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

    setQuerying(true);
    try {
      const safePage = Math.max(1, targetPage);
      const preservedDraftRows = options?.preserveDraftRows ?? draftRows;
      const result = await getApi().searchDocuments({
        connectionId: effectiveConnectionId,
        index: effectiveIndex,
        mode: effectiveMode,
        keyword: effectiveKeyword,
        jsonQuery: effectiveJsonQuery,
        filters: effectiveFilters,
        size: effectiveSize,
        from: (safePage - 1) * effectiveSize
      });
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
      setCheckedRowKey((current) => (current && preservedDraftRows.some((row) => row._rowKey === current) ? current : undefined));
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
        color: 'blue',
        title: '查询完成',
        message: `第 ${safePage} 页 · 已加载 ${result.documents.length} 条文档`
      });
    } catch (error) {
      showError(error, '查询失败');
    } finally {
      setQuerying(false);
    }
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
          color: 'mint',
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
    if (!selectedConnectionId || !selectedIndex || !selectedRowKey || selectedRowKey !== checkedRowKey || deleting || querying || saving) {
      return;
    }

    if (checkedDraftRow) {
      const confirmed = window.confirm('确定删除当前草稿行吗？未保存的内容会直接丢失。');
      if (!confirmed) {
        return;
      }

      const deletedRowIndex = rows.findIndex((row) => row._rowKey === checkedDraftRow._rowKey);
      const nextRows = rows.filter((row) => row._rowKey !== checkedDraftRow._rowKey);

      setRows(nextRows);
      setCheckedRowKey(undefined);
      if (nextRows.length > 0) {
        const nextSelectedIndex = deletedRowIndex >= 0 ? Math.min(deletedRowIndex, nextRows.length - 1) : 0;
        setSelectedRowKey(nextRows[nextSelectedIndex]?._rowKey);
      } else {
        setSelectedRowKey(undefined);
      }

      showAppNotification({
        id: 'delete-result',
        color: 'mint',
        title: '草稿已删除',
        message: '未保存的草稿行已移除'
      });
      return;
    }

    if (!selectedDocument || !checkedDocument) {
      return;
    }

    const documentId = checkedDocument._id;
    const hasUnsavedChanges = Boolean(dirtyState[documentId] && Object.keys(dirtyState[documentId]).length > 0);
    const confirmed = window.confirm(
      [
        `确定删除当前索引「${selectedIndex}」下的文档「${documentId}」吗？`,
        '此操作不可恢复。',
        hasUnsavedChanges ? '该文档存在未保存修改，这些修改会一并丢弃。' : '若该文档存在未保存修改，这些修改会一并丢弃。'
      ].join('\n')
    );

    if (!confirmed) {
      return;
    }

    const deletedRowKey = `${checkedDocument._index}:${checkedDocument._id}`;
    const deletedRowIndex = rows.findIndex((row) => row._rowKey === deletedRowKey);

    setDeleting(true);
    try {
      const result = await getApi().deleteDocument({
        connectionId: selectedConnectionId,
        index: selectedIndex,
        id: documentId
      });

      if (!result.success) {
        showAppNotification({
          id: 'delete-result',
          color: 'red',
          title: '删除失败',
          message: result.message ?? '删除失败',
          autoClose: 2600
        });
        return;
      }

      const nextDocuments = documents.filter((document) => document._id !== documentId);
      const nextRows = rows.filter((row) => row._id !== documentId);
      const nextTotal = Math.max(searchTotal - 1, 0);

      setDocuments(nextDocuments);
      setRows(nextRows);
      setDirtyState((current) => {
        const nextState = { ...current };
        delete nextState[documentId];
        return nextState;
      });
      setCheckedRowKey(undefined);
      setSearchTotal(nextTotal);

      if (nextRows.length > 0) {
        const nextSelectedIndex = deletedRowIndex >= 0 ? Math.min(deletedRowIndex, nextRows.length - 1) : 0;
        setSelectedRowKey(nextRows[nextSelectedIndex]?._rowKey);
      } else {
        setSelectedRowKey(undefined);
      }

      showAppNotification({
        id: 'delete-result',
        color: 'mint',
        title: '删除成功',
        message: `文档 ${documentId} 已删除`
      });

      if (nextRows.length === 0 && currentPage > 1) {
        await handleSearch(currentPage - 1);
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

    try {
      const originalMap = documents.reduce<Record<string, EsDocument>>((accumulator, document) => {
        accumulator[document._id] = document;
        return accumulator;
      }, {});

      const nextDirtyState: DirtyState = {};

      nextRows.forEach((row) => {
        const original = originalMap[row._id];
        if (row._isDraft) {
          return;
        }

        if (!original) {
          return;
        }

        Object.keys(row).forEach((field) => {
          if (field.startsWith('_')) {
            return;
          }

          const originalValue = original._source[field];
          const primitiveOriginalValue = getPrimitiveValueByPath(original._source, field);
          if (primitiveOriginalValue === undefined) {
            const nextValue = row[field];
            if (nextValue === '' || nextValue === undefined) {
              return;
            }

            const fieldType = fieldTypeMap[field];
            if (fieldType === 'boolean') {
              const text = String(nextValue).trim().toLowerCase();
              if (text !== 'true' && text !== 'false' && text !== '1' && text !== '0') {
                throw new Error('布尔字段请输入 true / false');
              }
              nextDirtyState[row._id] = {
                ...(nextDirtyState[row._id] ?? {}),
                [field]: text === 'true' || text === '1'
              };
              return;
            }

            if (['byte', 'short', 'integer', 'long', 'unsigned_long', 'half_float', 'float', 'double', 'scaled_float'].includes(fieldType)) {
              const parsed = Number(nextValue);
              if (Number.isNaN(parsed)) {
                throw new Error('数字字段只能输入数字');
              }
              nextDirtyState[row._id] = {
                ...(nextDirtyState[row._id] ?? {}),
                [field]: parsed
              };
              return;
            }

            nextDirtyState[row._id] = {
              ...(nextDirtyState[row._id] ?? {}),
              [field]: String(nextValue)
            };
            return;
          }

          const normalized = normalizeCellValue(row[field], primitiveOriginalValue);
          if (normalized !== undefined && normalized !== primitiveOriginalValue) {
            nextDirtyState[row._id] = {
              ...(nextDirtyState[row._id] ?? {}),
              [field]: normalized
            };
          }
        });
      });

      setRows(nextRows);
      setDirtyState(nextDirtyState);
    } catch (error) {
      showError(error, '单元格内容格式不正确');
      setRows((current) => [...current]);
    }
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
    setCheckedRowKey((current) => (current && current !== rowKey ? undefined : current));
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
    setCheckedRowKey(undefined);
    setGridScrollToTopSignal((current) => current + 1);
    showAppNotification({
      id: 'add-draft',
      color: 'blue',
      title: '已新增空白行',
      message: '可选填写 _id；留空时会由 Elasticsearch 自动生成'
    });
  }

  function handleToggleDeleteCheck(rowKey: string, checked: boolean): void {
    setCheckedRowKey(checked ? rowKey : undefined);
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
                <IconHeartHandshake size={18} />
              </div>
              <Stack gap={1} className="header-brand-copy">
                <Text fw={800} size="lg" className="header-brand-title">
                  Tiny ES Studio
                </Text>
                <Group gap="xs" align="center" wrap="wrap" className="header-brand-meta">
                  <Text size="xs" c="dimmed" className="header-brand-subtitle">
                    {compactHeader ? 'Elasticsearch 小工具' : '可爱但专业的 Elasticsearch 小工具'}
                  </Text>
                  <span className="header-signature-pill">by Lingfeng</span>
                </Group>
              </Stack>
            </Group>
            <Group gap={compactHeader ? 'xs' : 'sm'} className="header-actions">
              {selectedConnection ? (
                <div className="header-status-pill">
                  <Text size="xs" className="header-status-label">
                    当前连接
                  </Text>
                  <Text size="sm" fw={700} truncate className="header-status-value">
                    {selectedConnection.name}
                  </Text>
                </div>
              ) : null}

              <Tooltip label={selectedConnection ? '重新测试连接并刷新索引' : '请先选择连接'} withArrow>
                <ActionIcon
                  size={38}
                  radius="xl"
                  variant="transparent"
                  loading={loadingIndices}
                  disabled={!selectedConnection}
                  aria-label="重新测试连接并刷新索引"
                  className="header-icon-button"
                  onClick={() => selectedConnection && void loadIndices(selectedConnection)}
                >
                  <IconPlugConnected size={18} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </AppShell.Header>

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
                  setQueryMode('keyword');
                  setKeyword('');
                  setJsonQuery(defaultJsonQuery);
                  setFilters(nextFilters);
                  setSize(50);
                  setCurrentPage(1);
                  clearSearchResult();
                  setSidebarCollapsed(true);
                  showAppNotification({
                    id: 'index-switched',
                    color: 'blue',
                    title: '已切换索引',
                    message: `正在加载 ${indexName} 的前 50 条文档`
                  });
                  if (selectedConnectionId) {
                    void handleSearch(1, {
                      connectionId: selectedConnectionId,
                      index: indexName,
                      mode: 'keyword',
                      keyword: '',
                      jsonQuery: defaultJsonQuery,
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

        {!detailCollapsed ? (
          <AppShell.Aside className="app-aside">
            <JsonDetailPanel
              document={selectedDocument}
              collapsed={detailCollapsed}
              onToggleCollapse={() => setDetailCollapsed((value) => !value)}
            />
          </AppShell.Aside>
        ) : null}

        <AppShell.Main className="app-main">
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
                    <Tooltip label={canDelete ? '删除当前勾选文档' : '请先勾选当前要删除的文档'} withArrow>
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
                  checkedRowKey={checkedRowKey}
                  fieldTypeMap={fieldTypeMap}
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
              queryMode={queryMode}
              keyword={keyword}
              jsonQuery={jsonQuery}
              filters={filters}
              indexFields={indexFields}
              size={size}
              querying={querying}
              dirtyCount={dirtyCount}
              total={searchTotal}
              compactMode={compactViewport}
              onChangeMode={setQueryMode}
              onChangeKeyword={setKeyword}
              onChangeJsonQuery={setJsonQuery}
              onAddFilter={() => setFilters((current) => [...current, createFilter()])}
              onClearFilters={() => setFilters([createFilter()])}
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
              onToggleCollapsed={() => setQueryPanelCollapsed((current) => !current)}
            />
          </Stack>
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
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications position="top-right" limit={1} />
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </MantineProvider>
  );
}
