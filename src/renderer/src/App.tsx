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
  IconChevronLeft,
  IconChevronRight,
  IconHeartHandshake,
  IconPlugConnected
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
  const [queryMode, setQueryMode] = useState<QueryMode>('keyword');
  const [keyword, setKeyword] = useState('');
  const [jsonQuery, setJsonQuery] = useState('{\n  "query": {\n    "match_all": {}\n  }\n}');
  const [filters, setFilters] = useState<QueryFilter[]>([createFilter()]);
  const [size, setSize] = useState(50);
  const [documents, setDocuments] = useState<EsDocument[]>([]);
  const [rows, setRows] = useState<GridRow[]>([]);
  const [dirtyState, setDirtyState] = useState<DirtyState>({});
  const [selectedRowKey, setSelectedRowKey] = useState<string>();
  const [editorOpened, setEditorOpened] = useState(false);
  const [editingConnection, setEditingConnection] = useState<ConnectionConfig | null>(null);
  const [searchTotal, setSearchTotal] = useState(0);
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const selectedConnection = useMemo(
    () => connections.find((item) => item.id === selectedConnectionId),
    [connections, selectedConnectionId]
  );

  const selectedDocument = useMemo(
    () => documents.find((item) => `${item._index}:${item._id}` === selectedRowKey),
    [documents, selectedRowKey]
  );

  const dirtyCount = useMemo(
    () =>
      Object.values(dirtyState).reduce((count, fields) => count + Object.keys(fields).length, 0),
    [dirtyState]
  );

  const totalPages = useMemo(() => {
    if (searchTotal <= 0) {
      return 1;
    }

    return Math.max(1, Math.ceil(searchTotal / size));
  }, [searchTotal, size]);

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
    setJsonQuery('{\n  "query": {\n    "match_all": {}\n  }\n}');
    setFilters([createFilter()]);
    setSize(50);
    setCurrentPage(1);
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
      notifications.show({
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
      notifications.show({
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
        notifications.show({
          color: 'red',
          title: '连接失败',
          message: testResult.message
        });
        return;
      }

      const data = await getApi().getIndices(connection.id);
      setIndices(data);
      setSelectedIndex((current) => (current && data.some((item) => item.name === current) ? current : data[0]?.name));
      notifications.show({
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
    setSearchTotal(0);
    setCurrentPage(1);
  }

  async function handleSearch(targetPage = 1): Promise<void> {
    if (!selectedConnectionId) {
      notifications.show({
        color: 'yellow',
        title: '请先选择连接',
        message: '连接成功后才能查询文档'
      });
      return;
    }

    if (!selectedIndex) {
      notifications.show({
        color: 'yellow',
        title: '请先选择索引',
        message: '左侧索引列表中点选一个索引'
      });
      return;
    }

    setQuerying(true);
    try {
      const safePage = Math.max(1, targetPage);
      const result = await getApi().searchDocuments({
        connectionId: selectedConnectionId,
        index: selectedIndex,
        mode: queryMode,
        keyword,
        jsonQuery,
        filters,
        size,
        from: (safePage - 1) * size
      });
      const fields = collectFieldNames(result.documents);
      const nextRows = toGridRows(result.documents, fields);

      setDocuments(result.documents);
      setRows(nextRows);
      setDirtyState({});
      setSelectedRowKey(nextRows[0]?._rowKey);
      setSearchTotal(result.total);
      setCurrentPage(safePage);

      notifications.show({
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

    const updateTasks = Object.entries(dirtyState).map(([documentId, changes]) =>
      getApi().updateDocument({
        connectionId: selectedConnectionId,
        index: selectedIndex,
        id: documentId,
        changes
      })
    );

    if (updateTasks.length === 0) {
      return;
    }

    setSaving(true);
    try {
      const results = await Promise.all(updateTasks);
      const failedResults = results.filter((item) => !item.success);
      const successIds = results.filter((item) => item.success).map((item) => item.id);

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

      if (failedResults.length === 0) {
        notifications.show({
          color: 'mint',
          title: '保存成功',
          message: `已保存 ${results.length} 条文档修改`
        });
      } else {
        const message = failedResults.map(formatSaveError).join('；');
        notifications.show({
          color: 'red',
          title: '部分保存失败',
          message
        });
      }
    } catch (error) {
      showError(error, '保存失败');
    } finally {
      setSaving(false);
    }
  }

  function handleRowsChange(nextRows: GridRow[]): void {
    if (!documents.length) {
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
    notifications.show({
      color: 'red',
      title: fallback,
      message: error instanceof Error ? error.message : fallback
    });
  }

  return (
    <>
      <AppShell
        header={{ height: 88 }}
        navbar={{ width: sidebarCollapsed ? 28 : 348, breakpoint: 'lg' }}
        aside={detailCollapsed ? undefined : { width: 420, breakpoint: 'xl' }}
        padding="md"
        className="app-shell"
      >
        <AppShell.Header className="app-header">
          <Group justify="space-between" align="center" h="100%" px="lg" className="header-content">
            <Group gap="sm" className="header-brand">
              <div className="brand-badge">
                <IconHeartHandshake size={20} />
              </div>
              <Stack gap={2}>
                <Text fw={800} size="xl">
                  Tiny ES Studio
                </Text>
                <Group gap="xs" align="center" wrap="wrap">
                  <Text size="sm" c="dimmed">
                    可爱但专业的 Elasticsearch 小工具
                  </Text>
                  <span className="header-signature-pill">by Lingfeng</span>
                </Group>
              </Stack>
            </Group>
            <Group gap="sm" className="header-actions">
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
                  size={42}
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
                  setSelectedIndex(indexName);
                  resetQueryControls();
                  clearSearchResult();
                  notifications.show({
                    color: 'blue',
                    title: '查询条件已重置',
                    message: `已切换到索引 ${indexName}`
                  });
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
          <Stack gap="md" h="calc(100vh - 124px)">
            <QueryToolbar
              selectedConnection={selectedConnection}
              selectedIndex={selectedIndex}
              queryMode={queryMode}
              keyword={keyword}
              jsonQuery={jsonQuery}
              filters={filters}
              indexFields={indexFields}
              size={size}
              saving={saving}
              querying={querying}
              dirtyCount={dirtyCount}
              total={searchTotal}
              onChangeMode={setQueryMode}
              onChangeKeyword={setKeyword}
              onChangeJsonQuery={setJsonQuery}
              onAddFilter={() => setFilters((current) => [...current, createFilter()])}
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
              onSearch={() => void handleSearch()}
              onRefresh={() => void handleSearch()}
              onSave={() => void handleSaveChanges()}
              onReset={resetQueryControls}
            />

            <Card radius="xl" p="md" className="grid-card" style={{ flex: 1 }}>
              <Group justify="space-between" mb="sm">
                <div>
                  <Text fw={700}>文档表格</Text>
                  <Text size="sm" c="dimmed">
                    单击单元格即可编辑，修改过的单元格会高亮。当前索引已固定，所以列表中不再显示 `_index`。
                  </Text>
                </div>
                <Group gap="sm">
                  <Button
                    size="xs"
                    variant="light"
                    color="gray"
                    onClick={() => setDetailCollapsed((value) => !value)}
                  >
                    {detailCollapsed ? '展开详情面板' : '收起详情面板'}
                  </Button>
                  {rows.length > 0 ? (
                    <Text size="sm" c="dimmed">
                      第 {currentPage} / {totalPages} 页 · 当前列数 {collectFieldNames(documents).length + 1}
                    </Text>
                  ) : null}
                </Group>
              </Group>
              {rows.length > 0 ? (
                <DocumentsGrid
                  rows={rows}
                  documents={documents}
                  dirtyState={dirtyState}
                  selectedRowKey={selectedRowKey}
                  onRowsChange={(nextRows) => handleRowsChange(nextRows)}
                  onSelectRow={setSelectedRowKey}
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

              {rows.length > 0 ? (
                <Group justify="space-between" mt="md" className="grid-pagination">
                  <Text size="sm" c="dimmed">
                    共 {searchTotal} 条结果，每页 {size} 条
                  </Text>
                  <Group gap="sm">
                    <Button
                      size="xs"
                      variant="light"
                      color="gray"
                      disabled={currentPage <= 1 || querying}
                      onClick={() => void handleSearch(currentPage - 1)}
                    >
                      上一页
                    </Button>
                    <Text size="sm" fw={600}>
                      第 {currentPage} / {totalPages} 页
                    </Text>
                    <Button
                      size="xs"
                      variant="light"
                      color="gray"
                      disabled={currentPage >= totalPages || querying}
                      onClick={() => void handleSearch(currentPage + 1)}
                    >
                      下一页
                    </Button>
                  </Group>
                </Group>
              ) : null}
            </Card>
          </Stack>
        </AppShell.Main>
      </AppShell>
    </>
  );
}

function formatSaveError(item: SaveDocumentResult): string {
  return `${item.id}: ${item.message ?? '未知错误'}`;
}

export default function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="light">
      <Notifications position="top-right" />
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </MantineProvider>
  );
}
