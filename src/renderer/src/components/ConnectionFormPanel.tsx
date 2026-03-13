import { useEffect, useState, type ChangeEvent } from 'react';
import { Button, Card, Collapse, Group, Stack, Text } from '@mantine/core';
import { IconEye, IconEyeOff } from '@tabler/icons-react';
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
  skipTlsVerify: boolean;
}

const initialState: FormState = {
  name: '',
  nodeUrl: '',
  username: '',
  password: '',
  skipTlsVerify: false
};

function isHttpsNodeUrl(nodeUrl: string): boolean {
  return nodeUrl.trim().toLowerCase().startsWith('https://');
}

export function ConnectionFormPanel({
  opened,
  editingConnection,
  onClose,
  onSubmit
}: ConnectionFormPanelProps) {
  const [form, setForm] = useState<FormState>(initialState);
  const [saving, setSaving] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const usingHttps = isHttpsNodeUrl(form.nodeUrl);

  useEffect(() => {
    if (!editingConnection) {
      setForm(initialState);
      setPasswordVisible(false);
      return;
    }

    setForm({
      name: editingConnection.name,
      nodeUrl: editingConnection.nodeUrl,
      username: editingConnection.username ?? '',
      password: editingConnection.password ?? '',
      skipTlsVerify: editingConnection.skipTlsVerify ?? false
    });
    setPasswordVisible(false);
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
      const nextValue =
        field === 'skipTlsVerify' ? event.currentTarget.checked : event.currentTarget.value;
      setForm((current) => ({ ...current, [field]: nextValue }));
    };

  return (
    <Collapse in={opened}>
      <Card radius="xl" p="md" className="editor-card no-drag">
        <Stack gap="md">
          <div className="editor-heading">
            <Text fw={700} className="editor-heading-title">
              {editingConnection ? '编辑连接' : '新增连接'}
            </Text>
            <Text size="sm" c="dimmed" className="editor-heading-subtitle">
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
            <div className="password-input-shell">
              <input
                className="native-input password-input"
                type={passwordVisible ? 'text' : 'password'}
                placeholder="可选"
                value={form.password}
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                onChange={handleFieldChange('password')}
              />
              <button
                type="button"
                className="password-visibility-button"
                aria-label={passwordVisible ? '隐藏密码' : '显示密码'}
                onClick={() => setPasswordVisible((current) => !current)}
              >
                {passwordVisible ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>
          </label>
          <label className="native-field">
            <span className="native-field-label">HTTPS 证书</span>
            <label className="native-checkbox-row">
              <input
                type="checkbox"
                checked={form.skipTlsVerify}
                onChange={handleFieldChange('skipTlsVerify')}
              />
              忽略 HTTPS 证书校验
            </label>
            <Text size="xs" c="dimmed">
              {usingHttps
                ? '默认不勾选。只有连接失败并提示证书校验错误时，再开启这个选项。'
                : '仅在连接地址使用 https:// 时才会生效，常见于自签名证书或受控内网环境。'}
            </Text>
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
