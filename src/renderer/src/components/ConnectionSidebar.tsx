import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Badge, Button, Card, Collapse, Group, ScrollArea, Stack, Text, Tooltip } from '@mantine/core';
import { IconChevronDown, IconChevronRight, IconEdit, IconLink, IconPlugConnected, IconPlus, IconTrash } from '@tabler/icons-react';
import type { ConnectionConfig, IndexSummary } from '../../../shared/types';
import { ConnectionFormPanel } from './ConnectionFormPanel';

interface ConnectionSidebarProps {
  connections: ConnectionConfig[];
  selectedConnectionId?: string;
  selectedIndex?: string;
  indices: IndexSummary[];
  loadingIndices: boolean;
  editorOpened: boolean;
  editingConnection?: ConnectionConfig | null;
  onSelectConnection: (connection: ConnectionConfig) => void;
  onAddConnection: () => void;
  onEditConnection: (connection: ConnectionConfig) => void;
  onDeleteConnection: (connection: ConnectionConfig) => void;
  onSelectIndex: (indexName: string) => void;
  onCloseEditor: () => void;
  onSubmitConnection: (payload: {
    id?: string;
    name: string;
    nodeUrl: string;
    username?: string;
    password?: string;
    skipTlsVerify?: boolean;
  }) => Promise<void>;
}

export function ConnectionSidebar({
  connections,
  selectedConnectionId,
  selectedIndex,
  indices,
  loadingIndices,
  editorOpened,
  editingConnection,
  onSelectConnection,
  onAddConnection,
  onEditConnection,
  onDeleteConnection,
  onSelectIndex,
  onCloseEditor,
  onSubmitConnection
}: ConnectionSidebarProps) {
  const [connectionsCollapsed, setConnectionsCollapsed] = useState(false);
  const [indicesCollapsed, setIndicesCollapsed] = useState(false);
  const [indexKeyword, setIndexKeyword] = useState('');
  const editorAnchorRef = useRef<HTMLDivElement | null>(null);
  const filteredIndices = indices.filter((index) =>
    index.name.toLowerCase().includes(indexKeyword.trim().toLowerCase())
  );

  useEffect(() => {
    if (editorOpened && connectionsCollapsed) {
      setConnectionsCollapsed(false);
    }
  }, [connectionsCollapsed, editorOpened]);

  useEffect(() => {
    if (!editorOpened) {
      return;
    }

    editorAnchorRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  }, [editorOpened, editingConnection]);

  return (
    <Stack gap="md" className="sidebar-panel">
      <Card radius="xl" p="md" className="sidebar-section">
        <Group justify="space-between">
          <Group gap="sm">
            <ActionIcon variant="light" color="gray" onClick={() => setConnectionsCollapsed((value) => !value)}>
              {connectionsCollapsed ? <IconChevronRight size={16} /> : <IconChevronDown size={16} />}
            </ActionIcon>
            <div className="sidebar-heading">
              <Text fw={700} size="lg" className="sidebar-heading-title">
                连接
              </Text>
              <Text size="sm" c="dimmed" className="sidebar-heading-subtitle">
                保存常用 Elasticsearch 地址
              </Text>
            </div>
          </Group>
          <Button
            leftSection={<IconPlus size={16} />}
            radius="xl"
            color="pink"
            onClick={() => {
              setConnectionsCollapsed(false);
              onAddConnection();
            }}
          >
            新增
          </Button>
        </Group>

        <Collapse in={!connectionsCollapsed}>
          <Stack gap="md" mt="md">
            <div ref={editorAnchorRef}>
              <ConnectionFormPanel
                opened={editorOpened}
                editingConnection={editingConnection}
                onClose={onCloseEditor}
                onSubmit={onSubmitConnection}
              />
            </div>

            <ScrollArea h={editorOpened ? 170 : 250} scrollbarSize={6}>
              <Stack gap="sm">
                {connections.length === 0 ? (
                  <Card radius="xl" withBorder className="soft-card soft-card-empty">
                    <Text size="sm" c="dimmed">
                      还没有连接，先添加一个吧。
                    </Text>
                  </Card>
                ) : (
                  connections.map((connection) => {
                    const active = connection.id === selectedConnectionId;
                    return (
                      <Card
                        key={connection.id}
                        radius="xl"
                        withBorder
                        className={active ? 'soft-card soft-card-active' : 'soft-card'}
                        onClick={() => onSelectConnection(connection)}
                      >
                        <Group justify="space-between" align="flex-start" wrap="nowrap">
                          <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                            <Group gap="xs" className="sidebar-card-header">
                              <IconLink size={16} />
                              <Text fw={600} truncate className="sidebar-card-title">
                                {connection.name}
                              </Text>
                            </Group>
                            <Text size="xs" c="dimmed" truncate className="sidebar-card-subtitle">
                              {connection.nodeUrl}
                            </Text>
                          </Stack>
                          <Group gap={6} wrap="nowrap">
                            <Tooltip label="编辑连接">
                              <ActionIcon
                                variant="subtle"
                                color="gray"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setConnectionsCollapsed(false);
                                  onEditConnection(connection);
                                }}
                              >
                                <IconEdit size={16} />
                              </ActionIcon>
                            </Tooltip>
                            <Tooltip label="删除连接">
                              <ActionIcon variant="subtle" color="red" onClick={(event) => {
                                event.stopPropagation();
                                onDeleteConnection(connection);
                              }}>
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Group>
                      </Card>
                    );
                  })
                )}
              </Stack>
            </ScrollArea>
          </Stack>
        </Collapse>
      </Card>

      <Card radius="xl" p="md" className="sidebar-section sidebar-section-grow">
        <Group justify="space-between" mb="xs">
          <Group gap="sm">
            <ActionIcon variant="light" color="gray" onClick={() => setIndicesCollapsed((value) => !value)}>
              {indicesCollapsed ? <IconChevronRight size={16} /> : <IconChevronDown size={16} />}
            </ActionIcon>
            <div className="sidebar-heading">
              <Text fw={700} size="lg" className="sidebar-heading-title">
                索引
              </Text>
              <Text size="sm" c="dimmed" className="sidebar-heading-subtitle">
                {selectedConnectionId ? '选择一个索引开始查询' : '先选择连接'}
              </Text>
            </div>
          </Group>
          {loadingIndices ? <Badge color="pink" variant="light">加载中</Badge> : null}
        </Group>
        <Collapse in={!indicesCollapsed}>
          <Stack gap="md">
            <label className="native-field native-field-compact">
              <span className="native-field-label">筛选索引</span>
              <input
                className="native-input"
                placeholder="输入索引名关键字快速筛选"
                value={indexKeyword}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                onChange={(event) => setIndexKeyword(event.currentTarget.value)}
              />
            </label>

            <ScrollArea h="calc(100vh - 570px)" scrollbarSize={6}>
              <Stack gap="sm">
                {indices.length === 0 ? (
                  <Card radius="xl" withBorder className="soft-card soft-card-empty">
                    <Text size="sm" c="dimmed">
                      {selectedConnectionId ? '连接成功后会在这里显示索引列表。' : '暂无可展示内容'}
                    </Text>
                  </Card>
                ) : filteredIndices.length === 0 ? (
                  <Card radius="xl" withBorder className="soft-card soft-card-empty">
                    <Text size="sm" c="dimmed">
                      没有匹配到索引，换个关键字试试。
                    </Text>
                  </Card>
                ) : (
                  filteredIndices.map((index) => {
                    const active = index.name === selectedIndex;
                    return (
                      <Card
                        key={index.name}
                        radius="xl"
                        withBorder
                        className={active ? 'soft-card soft-card-index-active' : 'soft-card'}
                        onClick={() => onSelectIndex(index.name)}
                      >
                        <Group justify="space-between" wrap="nowrap">
                          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                            <Text fw={600} truncate className="sidebar-card-title">
                              {index.name}
                            </Text>
                            <Text size="xs" c="dimmed" className="sidebar-card-subtitle">
                              文档 {index.docCount ?? '-'} · {index.health ?? 'unknown'}
                            </Text>
                          </Stack>
                          <IconPlugConnected size={16} color={active ? '#df5b91' : '#b194aa'} />
                        </Group>
                      </Card>
                    );
                  })
                )}
              </Stack>
            </ScrollArea>
          </Stack>
        </Collapse>
      </Card>
    </Stack>
  );
}
