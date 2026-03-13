import { useEffect, useState, type ChangeEvent } from 'react';
import { Button, Card, Collapse, Group, Stack, Text } from '@mantine/core';
import type { ConnectionConfig, ConnectionInput } from '../../../shared/types';

interface ConnectionFormPanelProps {
  opened: boolean;
  editingConnection?: ConnectionConfig | null;
  onClose: () => void;
  onSubmit: (payload: ConnectionInput) => Promise<void>;
}

interface FormState {
  name: string;
  nodeUrl: string;
  username: string;
  password: string;
}

const initialState: FormState = {
  name: '',
  nodeUrl: '',
  username: '',
  password: ''
};

export function ConnectionFormPanel({
  opened,
  editingConnection,
  onClose,
  onSubmit
}: ConnectionFormPanelProps) {
  const [form, setForm] = useState<FormState>(initialState);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editingConnection) {
      setForm(initialState);
      return;
    }

    setForm({
      name: editingConnection.name,
      nodeUrl: editingConnection.nodeUrl,
      username: editingConnection.username ?? '',
      password: editingConnection.password ?? ''
    });
  }, [editingConnection, opened]);

  const handleSubmit = async (): Promise<void> => {
    setSaving(true);
    try {
      await onSubmit({
        id: editingConnection?.id,
        ...form
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleFieldChange =
    (field: keyof FormState) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      const { value } = event.currentTarget;
      setForm((current) => ({ ...current, [field]: value }));
    };

  return (
    <Collapse in={opened}>
      <Card radius="xl" p="md" className="editor-card no-drag">
        <Stack gap="md">
          <div>
            <Text fw={700}>{editingConnection ? '编辑连接' : '新增连接'}</Text>
            <Text size="sm" c="dimmed">
              先保存一条连接，再去测试并加载索引
            </Text>
          </div>
          <label className="native-field">
            <span className="native-field-label">连接名称</span>
            <input
              className="native-input"
              placeholder="例如：测试环境 ES"
              value={form.name}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              onChange={handleFieldChange('name')}
            />
          </label>
          <label className="native-field">
            <span className="native-field-label">Elasticsearch 地址</span>
            <input
              className="native-input"
              placeholder="http://localhost:9200"
              value={form.nodeUrl}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              onChange={handleFieldChange('nodeUrl')}
            />
          </label>
          <label className="native-field">
            <span className="native-field-label">用户名</span>
            <input
              className="native-input"
              placeholder="可选"
              value={form.username}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              onChange={handleFieldChange('username')}
            />
          </label>
          <label className="native-field">
            <span className="native-field-label">密码</span>
            <input
              className="native-input"
              type="password"
              placeholder="可选"
              value={form.password}
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
              onChange={handleFieldChange('password')}
            />
          </label>
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={onClose}>
              取消
            </Button>
            <Button color="pink" loading={saving} onClick={handleSubmit}>
              保存连接
            </Button>
          </Group>
        </Stack>
      </Card>
    </Collapse>
  );
}
