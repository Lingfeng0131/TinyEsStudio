import { ActionIcon, Badge, Button, Card, Code, Group, Modal, ScrollArea, SegmentedControl, Stack, Text } from '@mantine/core';
import { IconArrowsMaximize, IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import type { EsDocument, IndexMetadataResult } from '../../../shared/types';
import { showAppNotification } from '../utils/appNotifications';

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

const JSON_PREVIEW_MAX_CHARS = 40000;
const JSON_PREVIEW_MAX_STRING_CHARS = 4000;
const JSON_MODAL_FULL_MAX_CHARS = 160000;
const JSON_MODAL_FULL_MAX_STRING_CHARS = 24000;

function buildJsonPreview(source: unknown): {
  text: string;
  truncated: boolean;
} {
  if (source === undefined) {
    return {
      text: '',
      truncated: false
    };
  }

  let truncated = false;
  const previewText =
    JSON.stringify(
      source,
      (_key, value) => {
        if (typeof value === 'string' && value.length > JSON_PREVIEW_MAX_STRING_CHARS) {
          truncated = true;
          return `${value.slice(0, JSON_PREVIEW_MAX_STRING_CHARS)}\n...[内容过长，已截断，原始长度 ${value.length} 字符]`;
        }

        return value;
      },
      2
    ) ?? '';

  if (previewText.length <= JSON_PREVIEW_MAX_CHARS) {
    return {
      text: previewText,
      truncated
    };
  }

  truncated = true;
  return {
    text: `${previewText.slice(0, JSON_PREVIEW_MAX_CHARS)}\n...[JSON 预览已截断，请使用“复制完整 JSON”查看全部内容]`,
    truncated
  };
}

function buildJsonFullText(source: unknown): {
  text: string;
  safeToRender: boolean;
  reason?: string;
} {
  if (source === undefined) {
    return {
      text: '',
      safeToRender: true
    };
  }

  let maxStringLength = 0;
  const fullText =
    JSON.stringify(
      source,
      (_key, value) => {
        if (typeof value === 'string') {
          maxStringLength = Math.max(maxStringLength, value.length);
        }

        return value;
      },
      2
    ) ?? '';

  if (maxStringLength > JSON_MODAL_FULL_MAX_STRING_CHARS) {
    return {
      text: fullText,
      safeToRender: false,
      reason: `存在超长字段（单字段超过 ${JSON_MODAL_FULL_MAX_STRING_CHARS} 字符）`
    };
  }

  if (fullText.length > JSON_MODAL_FULL_MAX_CHARS) {
    return {
      text: fullText,
      safeToRender: false,
      reason: `完整 JSON 超过 ${JSON_MODAL_FULL_MAX_CHARS} 字符`
    };
  }

  return {
    text: fullText,
    safeToRender: true
  };
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
  const activeSource = useMemo(() => {
    if (activeTab === 'document') {
      return document;
    }

    if (activeTab === 'settings') {
      return metadata?.settings;
    }

    return metadata?.mappings;
  }, [activeTab, document, metadata]);

  const activeJsonPreview = useMemo(() => buildJsonPreview(activeSource), [activeSource]);

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

  const modalJsonState = useMemo(() => {
    if (!opened || !canExpand) {
      return {
        text: '',
        safeToRender: true,
        reason: undefined as string | undefined
      };
    }

    return buildJsonFullText(activeSource);
  }, [activeSource, canExpand, opened]);

  async function handleCopyFullJson(): Promise<void> {
    if (activeSource === undefined) {
      return;
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(activeSource, null, 2));
      showAppNotification({
        id: 'json-copy-success',
        color: 'pink',
        title: '复制成功',
        message: '完整 JSON 已复制到剪贴板'
      });
    } catch (error) {
      console.error('复制完整 JSON 失败', error);
      showAppNotification({
        id: 'json-copy-failed',
        color: 'red',
        title: '复制失败',
        message: '当前环境无法写入剪贴板，请稍后重试'
      });
    }
  }

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
              {activeTab === 'document' && document ? (
                <Badge radius="xl" color="pink" variant="light">
                  文档 {document._id}
                </Badge>
              ) : null}
              {loadingMetadata && activeTab !== 'document' ? (
                <Badge radius="xl" color="pink" variant="light">
                  读取中
                </Badge>
              ) : null}
              {activeJsonPreview.truncated ? (
                <Badge radius="xl" color="yellow" variant="light">
                  当前为安全预览，长内容已截断
                </Badge>
              ) : null}
            </Group>
          </Stack>

          <ScrollArea h="100%" scrollbarSize={6}>
            {activeTab === 'document' ? (
              document ? (
                <Stack gap="xs">
                  <Group justify="space-between" align="center">
                    <Text size="xs" c="dimmed">
                      为避免长文本导致界面卡顿，这里默认展示安全预览。
                    </Text>
                    <Button size="xs" variant="subtle" color="pink" onClick={() => void handleCopyFullJson()}>
                      复制完整 JSON
                    </Button>
                  </Group>
                  <Code block className="json-block">
                    {activeJsonPreview.text}
                  </Code>
                </Stack>
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
              <Stack gap="xs">
                <Group justify="space-between" align="center">
                  <Text size="xs" c="dimmed">
                    为避免长文本导致界面卡顿，这里默认展示安全预览。
                  </Text>
                  <Button size="xs" variant="subtle" color="pink" onClick={() => void handleCopyFullJson()}>
                    复制完整 JSON
                  </Button>
                </Group>
                <Code block className="json-block">
                  {activeJsonPreview.text}
                </Code>
              </Stack>
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
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Text size="sm" c="dimmed">
              {modalJsonState.safeToRender
                ? '当前内容处于安全范围，放大区域会直接展示完整 JSON。'
                : `当前内容过大，已自动切换为性能模式。${modalJsonState.reason ?? ''}`}
            </Text>
            <Button size="xs" variant="light" color="pink" disabled={!canExpand} onClick={() => void handleCopyFullJson()}>
              复制完整 JSON
            </Button>
          </Group>
          <Code block className="json-block json-block-modal">
            {(modalJsonState.safeToRender ? modalJsonState.text : activeJsonPreview.text) || '暂无可展示内容'}
          </Code>
        </Stack>
      </Modal>
    </>
  );
}
