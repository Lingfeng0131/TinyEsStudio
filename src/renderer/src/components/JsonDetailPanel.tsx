import { ActionIcon, Badge, Button, Card, Code, Group, Modal, ScrollArea, SegmentedControl, Stack, Text } from '@mantine/core';
import { IconArrowsMaximize, IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand } from '@tabler/icons-react';
import { useState } from 'react';
import type { EsDocument, IndexMetadataResult } from '../../../shared/types';

type DetailTab = 'document' | 'settings' | 'mapping';

interface JsonDetailPanelProps {
  document?: EsDocument;
  selectedIndex?: string;
  metadata?: IndexMetadataResult;
  loadingMetadata: boolean;
  activeTab: DetailTab;
  onChangeTab: (value: DetailTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function JsonDetailPanel({
  document,
  selectedIndex,
  metadata,
  loadingMetadata,
  activeTab,
  onChangeTab,
  collapsed,
  onToggleCollapse
}: JsonDetailPanelProps) {
  const [opened, setOpened] = useState(false);
  const documentJsonText = document ? JSON.stringify(document, null, 2) : '';
  const settingsJsonText = metadata ? JSON.stringify(metadata.settings, null, 2) : '';
  const mappingJsonText = metadata ? JSON.stringify(metadata.mappings, null, 2) : '';

  const activeJsonText =
    activeTab === 'document'
      ? documentJsonText
      : activeTab === 'settings'
        ? settingsJsonText
        : mappingJsonText;

  const detailTitle =
    activeTab === 'document'
      ? '文档 JSON 详情'
      : activeTab === 'settings'
        ? '索引设置详情'
        : '索引映射详情';

  const detailSubtitle =
    activeTab === 'document'
      ? '查看当前选中文档的完整内容'
      : activeTab === 'settings'
        ? '查看当前索引的 settings 原始 JSON'
        : '查看当前索引的 mappings 原始 JSON';

  const canExpand =
    activeTab === 'document'
      ? Boolean(document)
      : Boolean(metadata);

  return (
    <>
      <Card radius="xl" p="lg" className="json-card">
        <Stack gap="md" h="100%">
          <Group justify="space-between" align="flex-start">
            <div className="json-heading">
              <Text fw={700} size="lg" className="json-heading-title">
                {activeTab === 'document' ? '原始 JSON' : activeTab === 'settings' ? '索引设置' : '索引映射'}
              </Text>
              <Text size="sm" c="dimmed" className="json-heading-subtitle">
                {detailSubtitle}
              </Text>
            </div>
            <Group gap="xs">
              <ActionIcon variant="light" color="gray" onClick={onToggleCollapse} aria-label={collapsed ? '展开详情' : '收起详情'}>
                {collapsed ? <IconLayoutSidebarRightExpand size={16} /> : <IconLayoutSidebarRightCollapse size={16} />}
              </ActionIcon>
              <Button
                size="xs"
                variant="light"
                color="pink"
                leftSection={<IconArrowsMaximize size={14} />}
                disabled={!canExpand}
                onClick={() => setOpened(true)}
              >
                放大查看
              </Button>
            </Group>
          </Group>

          <Stack gap="xs">
            <SegmentedControl
              radius="xl"
              value={activeTab}
              onChange={(value) => onChangeTab(value as DetailTab)}
              data={[
                { label: '文档 JSON', value: 'document' },
                { label: '索引设置', value: 'settings' },
                { label: '索引映射', value: 'mapping' }
              ]}
            />
            <Group gap="xs" wrap="wrap">
              {selectedIndex ? (
                <Badge radius="xl" color="pink" variant="light">
                  当前索引 {selectedIndex}
                </Badge>
              ) : null}
              {document ? (
                <Badge radius="xl" color="pink" variant="light">
                  文档 {document._id}
                </Badge>
              ) : null}
              {loadingMetadata && activeTab !== 'document' ? (
                <Badge radius="xl" color="pink" variant="light">
                  读取中
                </Badge>
              ) : null}
            </Group>
          </Stack>

          <ScrollArea h="100%" scrollbarSize={6}>
            {activeTab === 'document' ? (
              document ? (
                <Code block className="json-block">
                  {documentJsonText}
                </Code>
              ) : (
                <Text size="sm" c="dimmed">
                  点击表格中的一行后，这里会显示完整 JSON。
                </Text>
              )
            ) : loadingMetadata ? (
              <Text size="sm" c="dimmed">
                正在读取当前索引的 {activeTab === 'settings' ? 'settings' : 'mappings'}...
              </Text>
            ) : metadata ? (
              <Code block className="json-block">
                {activeJsonText}
              </Code>
            ) : (
              <Text size="sm" c="dimmed">
                先选择一个索引，这里就能查看它的 {activeTab === 'settings' ? 'settings' : 'mappings'}。
              </Text>
            )}
          </ScrollArea>
        </Stack>
      </Card>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title={detailTitle}
        size="85%"
        centered
        radius="xl"
        overlayProps={{ blur: 6 }}
      >
        <Code block className="json-block json-block-modal">
          {activeJsonText || '暂无可展示内容'}
        </Code>
      </Modal>
    </>
  );
}
