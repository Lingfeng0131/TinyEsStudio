import { ActionIcon, Button, Card, Code, Group, Modal, ScrollArea, Stack, Text } from '@mantine/core';
import { IconArrowsMaximize, IconLayoutSidebarRightCollapse, IconLayoutSidebarRightExpand } from '@tabler/icons-react';
import { useState } from 'react';
import type { EsDocument } from '../../../shared/types';

interface JsonDetailPanelProps {
  document?: EsDocument;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function JsonDetailPanel({ document, collapsed, onToggleCollapse }: JsonDetailPanelProps) {
  const [opened, setOpened] = useState(false);
  const jsonText = document ? JSON.stringify(document, null, 2) : '';

  return (
    <>
      <Card radius="xl" p="lg" className="json-card">
        <Stack gap="md" h="100%">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text fw={700} size="lg">
                原始 JSON
              </Text>
              <Text size="sm" c="dimmed">
                查看当前选中文档的完整内容
              </Text>
            </div>
            <Group gap="xs">
              <ActionIcon variant="light" color="gray" onClick={onToggleCollapse} aria-label={collapsed ? '展开详情' : '收起详情'}>
                {collapsed ? <IconLayoutSidebarRightExpand size={16} /> : <IconLayoutSidebarRightCollapse size={16} />}
              </ActionIcon>
              <Button
                size="xs"
                variant="light"
                color="blue"
                leftSection={<IconArrowsMaximize size={14} />}
                disabled={!document}
                onClick={() => setOpened(true)}
              >
                放大查看
              </Button>
            </Group>
          </Group>
          <ScrollArea h="100%" scrollbarSize={6}>
            {document ? (
              <Code block className="json-block">
                {jsonText}
              </Code>
            ) : (
              <Text size="sm" c="dimmed">
                点击表格中的一行后，这里会显示完整 JSON。
              </Text>
            )}
          </ScrollArea>
        </Stack>
      </Card>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="文档 JSON 详情"
        size="85%"
        centered
        radius="xl"
        overlayProps={{ blur: 6 }}
      >
        <Code block className="json-block json-block-modal">
          {jsonText || '暂无文档内容'}
        </Code>
      </Modal>
    </>
  );
}
