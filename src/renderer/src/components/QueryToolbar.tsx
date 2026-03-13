import type { ChangeEvent } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip
} from '@mantine/core';
import { IconDeviceFloppy, IconFilterPlus, IconRefresh, IconRestore, IconSearch, IconTrash } from '@tabler/icons-react';
import type { ConnectionConfig, FilterOperator, IndexFieldOption, QueryFilter, QueryMode } from '../../../shared/types';

interface QueryToolbarProps {
  selectedConnection?: ConnectionConfig;
  selectedIndex?: string;
  queryMode: QueryMode;
  keyword: string;
  jsonQuery: string;
  filters: QueryFilter[];
  indexFields: IndexFieldOption[];
  size: number;
  saving: boolean;
  querying: boolean;
  dirtyCount: number;
  total: number;
  onChangeMode: (mode: QueryMode) => void;
  onChangeKeyword: (value: string) => void;
  onChangeJsonQuery: (value: string) => void;
  onAddFilter: () => void;
  onUpdateFilter: (id: string, patch: Partial<QueryFilter>) => void;
  onRemoveFilter: (id: string) => void;
  onChangeSize: (value: number) => void;
  onSearch: () => void;
  onRefresh: () => void;
  onSave: () => void;
  onReset: () => void;
}

const operatorOptions: Array<{ value: FilterOperator; label: string }> = [
  { value: 'contains', label: '包含' },
  { value: 'eq', label: '等于' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'exists', label: '存在字段' }
];

export function QueryToolbar({
  selectedConnection,
  selectedIndex,
  queryMode,
  keyword,
  jsonQuery,
  filters,
  indexFields,
  size,
  saving,
  querying,
  dirtyCount,
  total,
  onChangeMode,
  onChangeKeyword,
  onChangeJsonQuery,
  onAddFilter,
  onUpdateFilter,
  onRemoveFilter,
  onChangeSize,
  onSearch,
  onRefresh,
  onSave,
  onReset
}: QueryToolbarProps) {
  const handleKeywordChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onChangeKeyword(event.currentTarget.value);
  };

  const handleJsonChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    onChangeJsonQuery(event.currentTarget.value);
  };

  return (
    <Card radius="xl" p="lg" className="toolbar-card no-drag">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Text fw={700} size="lg">
              查询面板
            </Text>
            <Text size="sm" c="dimmed">
              {selectedConnection ? `${selectedConnection.name} / ${selectedIndex ?? '未选择索引'}` : '先选择一个连接'}
            </Text>
          </Stack>
          <Group gap="xs">
            <Badge radius="xl" color="blue" variant="light">
              总命中 {total}
            </Badge>
            <Badge radius="xl" color={dirtyCount > 0 ? 'pink' : 'gray'} variant="light">
              已修改 {dirtyCount}
            </Badge>
          </Group>
        </Group>

        <Card className="toolbar-subcard" p="md">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start" wrap="wrap" className="toolbar-compact-row">
              <Group align="flex-end" gap="sm" wrap="wrap" className="toolbar-compact-controls">
                <SegmentedControl
                  radius="xl"
                  value={queryMode}
                  onChange={(value) => onChangeMode(value as QueryMode)}
                  data={[
                    { label: '关键词', value: 'keyword' },
                    { label: 'JSON', value: 'json' }
                  ]}
                />
                <NumberInput
                  label="条数"
                  min={1}
                  max={200}
                  value={size}
                  onChange={(value) => onChangeSize(Number(value) || 50)}
                  allowDecimal={false}
                  clampBehavior="strict"
                  className="size-input"
                />
              </Group>

              <div className="toolbar-action-cluster">
                <Text size="xs" fw={700} className="toolbar-action-title">
                  快捷操作
                </Text>
                <Text size="xs" c="dimmed" className="toolbar-action-hint">
                  查 / 刷 / 存
                </Text>
                <Group gap="xs" wrap="nowrap" className="toolbar-action-strip">
                  <Tooltip label="重置查询条件" withArrow>
                    <ActionIcon
                      radius="xl"
                      size={42}
                      variant="transparent"
                      onClick={onReset}
                      className="toolbar-action-icon toolbar-action-icon-reset"
                    >
                      <IconRestore size={18} />
                    </ActionIcon>
                  </Tooltip>

                  <Tooltip label="查询文档" withArrow>
                    <ActionIcon
                      radius="xl"
                      size={42}
                      variant="transparent"
                      loading={querying}
                      onClick={onSearch}
                      className="toolbar-action-icon toolbar-action-icon-search"
                    >
                      <IconSearch size={18} />
                    </ActionIcon>
                  </Tooltip>

                  <Tooltip label="刷新结果" withArrow>
                    <ActionIcon
                      radius="xl"
                      size={42}
                      variant="transparent"
                      onClick={onRefresh}
                      className="toolbar-action-icon toolbar-action-icon-refresh"
                    >
                      <IconRefresh size={18} />
                    </ActionIcon>
                  </Tooltip>

                  <Tooltip label={dirtyCount === 0 ? '还没有可保存的修改' : '保存已修改字段'} withArrow>
                    <ActionIcon
                      radius="xl"
                      size={42}
                      variant="transparent"
                      loading={saving}
                      disabled={dirtyCount === 0}
                      onClick={onSave}
                      className="toolbar-action-icon toolbar-action-icon-save"
                    >
                      <IconDeviceFloppy size={18} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </div>
            </Group>

            {queryMode === 'keyword' ? (
              <Stack gap={6}>
                <TextInput
                  label="关键词查询"
                  placeholder="例如：姓名、手机号、订单号、邮箱片段"
                  value={keyword}
                  onChange={handleKeywordChange}
                />
                <Text size="xs" c="dimmed">
                  会尝试在所有字段里做全文匹配和模糊包含匹配，适合直接输你能看到的字段内容片段。
                </Text>

                <div className="filter-section">
                  <Group justify="space-between" align="center" mb="xs">
                    <div>
                      <Text fw={700} size="sm">
                        条件筛选
                      </Text>
                      <Text size="xs" c="dimmed">
                        支持多条件 AND 筛选，例如 `status = paid`、`amount &gt; 100`
                      </Text>
                    </div>
                    <Button
                      size="xs"
                      variant="light"
                      color="pink"
                      leftSection={<IconFilterPlus size={14} />}
                      onClick={onAddFilter}
                    >
                      添加条件
                    </Button>
                  </Group>

                  <Stack gap="sm">
                    {filters.map((filter) => (
                      <div key={filter.id} className="filter-row">
                        <select
                          className="native-input filter-select filter-select-field"
                          value={filter.field}
                          onChange={(event) => onUpdateFilter(filter.id, { field: event.currentTarget.value })}
                        >
                          <option value="">请选择字段</option>
                          {indexFields.map((field) => (
                            <option key={field.name} value={field.name}>
                              {field.name} ({field.type})
                            </option>
                          ))}
                        </select>
                        <select
                          className="native-input filter-select"
                          value={filter.operator}
                          onChange={(event) =>
                            onUpdateFilter(filter.id, { operator: event.currentTarget.value as FilterOperator })
                          }
                        >
                          {operatorOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        {filter.operator !== 'exists' ? (
                          <input
                            className="native-input filter-input"
                            placeholder="值，例如 paid / 100 / true"
                            value={filter.value ?? ''}
                            spellCheck={false}
                            autoComplete="off"
                            onChange={(event) => onUpdateFilter(filter.id, { value: event.currentTarget.value })}
                          />
                        ) : (
                          <div className="filter-placeholder">无需填写值</div>
                        )}
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => onRemoveFilter(filter.id)}
                          disabled={filters.length === 1}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </div>
                    ))}
                  </Stack>
                </div>
              </Stack>
            ) : (
              <Textarea
                label="JSON 查询"
                placeholder='例如：{"query":{"match":{"status":"online"}}}'
                value={jsonQuery}
                onChange={handleJsonChange}
                autosize
                minRows={4}
                maxRows={7}
              />
            )}
          </Stack>
        </Card>
      </Stack>
    </Card>
  );
}
