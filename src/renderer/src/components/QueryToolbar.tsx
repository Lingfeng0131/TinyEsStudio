import { useEffect, useState, type ChangeEvent } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Collapse,
  Group,
  NumberInput,
  Stack,
  Text,
  TextInput,
  Tooltip
} from '@mantine/core';
import { IconFilterPlus, IconRefresh, IconRestore, IconSearch, IconTrash, IconX } from '@tabler/icons-react';
import type { ConnectionConfig, FilterJoinMode, FilterOperator, IndexFieldOption, QueryFilter } from '../../../shared/types';
import { getAllowedFilterOperators, isFilterFieldSupported } from '../../../shared/filtering';

interface QueryToolbarProps {
  selectedConnection?: ConnectionConfig;
  selectedIndex?: string;
  collapsed: boolean;
  compactMode: boolean;
  keyword: string;
  filters: QueryFilter[];
  filterJoinMode: FilterJoinMode;
  indexFields: IndexFieldOption[];
  size: number;
  querying: boolean;
  loadingIndexMetadata: boolean;
  dirtyCount: number;
  total: number;
  onChangeKeyword: (value: string) => void;
  onAddFilter: () => void;
  onClearFilters: () => void;
  onChangeFilterJoinMode: (value: FilterJoinMode) => void;
  onUpdateFilter: (id: string, patch: Partial<QueryFilter>) => void;
  onRemoveFilter: (id: string) => void;
  onChangeSize: (value: number) => void;
  onSearch: () => void;
  onRefresh: () => void;
  onReset: () => void;
  onOpenIndexMetadata: () => void;
  onToggleCollapsed: () => void;
}

const operatorOptions: Array<{ value: FilterOperator; label: string }> = [
  { value: 'contains', label: '包含' },
  { value: 'eq', label: '等于' },
  { value: 'gt', label: '大于' },
  { value: 'gte', label: '大于等于' },
  { value: 'lt', label: '小于' },
  { value: 'lte', label: '小于等于' },
  { value: 'exists', label: '有这个字段' },
  { value: 'not_exists', label: '没有这个字段' }
];

export function QueryToolbar({
  selectedConnection,
  selectedIndex,
  collapsed,
  compactMode,
  keyword,
  filters,
  filterJoinMode,
  indexFields,
  size,
  querying,
  loadingIndexMetadata,
  dirtyCount,
  total,
  onChangeKeyword,
  onAddFilter,
  onClearFilters,
  onChangeFilterJoinMode,
  onUpdateFilter,
  onRemoveFilter,
  onChangeSize,
  onSearch,
  onRefresh,
  onReset,
  onOpenIndexMetadata,
  onToggleCollapsed
}: QueryToolbarProps) {
  const handleKeywordChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onChangeKeyword(event.currentTarget.value);
  };

  const indexFieldMap = indexFields.reduce<Record<string, IndexFieldOption>>((accumulator, field) => {
    accumulator[field.name] = field;
    return accumulator;
  }, {});
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const activeFilterCount = filters.filter((filter) => filter.field.trim()).length;
  const collapsedSummary = keyword.trim()
    ? `关键词：${keyword.trim()}`
    : activeFilterCount > 0
      ? `已配置 ${activeFilterCount} 个${filterJoinMode === 'or' ? ' OR ' : ' AND '}条件`
      : '未设置查询条件';

  useEffect(() => {
    if (activeFilterCount > 0) {
      setFiltersExpanded(true);
    }
  }, [activeFilterCount]);

  return (
    <Card
      radius="xl"
      p={compactMode ? 'md' : 'lg'}
      className={compactMode ? 'toolbar-card toolbar-card-compact-mode no-drag' : 'toolbar-card no-drag'}
    >
      {collapsed ? (
        <Group justify="space-between" align="center" wrap="wrap" className="toolbar-collapsed-row">
          <Group gap="sm" align="center" wrap="wrap" className="toolbar-primary-controls">
            <Button size="xs" variant="subtle" color="gray" className="toolbar-collapse-toggle" onClick={onToggleCollapsed}>
              {compactMode ? '展开查询' : '展开查询面板'}
            </Button>
            <div className="size-inline-field">
              <Text size="sm" fw={600} className="size-inline-label">
                每页
              </Text>
              <NumberInput
                aria-label="每页条数"
                min={1}
                max={200}
                value={size}
                onChange={(value) => onChangeSize(Number(value) || 50)}
                allowDecimal={false}
                clampBehavior="strict"
                className="size-input"
              />
            </div>
            <Button
              size="sm"
              variant={activeFilterCount > 0 ? 'light' : 'subtle'}
              color={activeFilterCount > 0 ? 'pink' : 'gray'}
              className="toolbar-filter-toggle"
              leftSection={<IconFilterPlus size={14} />}
              onClick={onToggleCollapsed}
            >
              {compactMode ? '筛选' : '展开筛选'}
              {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Button>
            <Text size="sm" c="dimmed" className="toolbar-collapsed-summary">
              {collapsedSummary}
            </Text>
          </Group>

          <Group gap="xs" wrap="nowrap" className="toolbar-action-strip toolbar-action-strip-compact">
            <Button
              size="xs"
              variant="subtle"
              color="pink"
              className="toolbar-collapse-toggle"
              disabled={!selectedIndex}
              loading={loadingIndexMetadata}
              onClick={onOpenIndexMetadata}
            >
              索引信息
            </Button>
            <Tooltip label="重置查询条件" withArrow>
              <ActionIcon
                radius="xl"
                size={40}
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
                size={40}
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
                size={40}
                variant="transparent"
                onClick={onRefresh}
                className="toolbar-action-icon toolbar-action-icon-refresh"
              >
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      ) : (
        <Stack gap="sm">
          <Group justify="space-between" align="center" className="toolbar-header-row">
            <Stack gap={3} className="toolbar-heading">
              <Text fw={700} size="md" className="toolbar-heading-title">查询面板</Text>
              <Text size="sm" c="dimmed" className="toolbar-heading-subtitle">
                {selectedConnection ? `${selectedConnection.name} / ${selectedIndex ?? '未选择索引'}` : '先选择一个连接'}
              </Text>
            </Stack>
            <Group gap="xs">
              <Badge radius="xl" color="pink" variant="light">
                总命中 {total}
              </Badge>
              <Badge radius="xl" color={dirtyCount > 0 ? 'pink' : 'gray'} variant="light">
                已修改 {dirtyCount}
              </Badge>
              <Button
                size="xs"
                variant="subtle"
                color="pink"
                className="toolbar-collapse-toggle"
                disabled={!selectedIndex}
                loading={loadingIndexMetadata}
                onClick={onOpenIndexMetadata}
              >
                索引信息
              </Button>
              <Button size="xs" variant="subtle" color="gray" className="toolbar-collapse-toggle" onClick={onToggleCollapsed}>
                {compactMode ? '收起查询' : '收起查询面板'}
              </Button>
            </Group>
          </Group>

          <div className="toolbar-panel">
            <Stack gap="sm">
              <Group justify="space-between" align="center" wrap="wrap" className="toolbar-primary-row">
                <Group align="center" gap="sm" wrap="wrap" className="toolbar-primary-controls">
                  <div className="size-inline-field">
                    <Text size="sm" fw={600} className="size-inline-label">
                      每页
                    </Text>
                    <NumberInput
                      aria-label="每页条数"
                      min={1}
                      max={200}
                      value={size}
                      onChange={(value) => onChangeSize(Number(value) || 50)}
                      allowDecimal={false}
                      clampBehavior="strict"
                      className="size-input"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant={activeFilterCount > 0 ? 'light' : 'subtle'}
                    color={activeFilterCount > 0 ? 'pink' : 'gray'}
                    className="toolbar-filter-toggle"
                    leftSection={<IconFilterPlus size={14} />}
                    onClick={() => setFiltersExpanded((current) => !current)}
                  >
                    {activeFilterCount > 0 ? `筛选 (${activeFilterCount})` : '筛选'}
                  </Button>
                </Group>

                <Group gap="xs" wrap="nowrap" className="toolbar-action-strip toolbar-action-strip-compact">
                  <Tooltip label="重置查询条件" withArrow>
                    <ActionIcon
                      radius="xl"
                      size={40}
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
                      size={40}
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
                      size={40}
                      variant="transparent"
                      onClick={onRefresh}
                      className="toolbar-action-icon toolbar-action-icon-refresh"
                    >
                      <IconRefresh size={18} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>

              <Stack gap={6} className="toolbar-query-shell">
                <TextInput
                  label="关键词查询"
                  placeholder="例如：姓名、手机号、订单号、邮箱片段"
                  value={keyword}
                  onChange={handleKeywordChange}
                />
                <Text size="xs" c="dimmed">
                  会尝试在所有字段里做全文匹配和模糊包含匹配，适合直接输你能看到的字段内容片段。
                </Text>

                <Collapse in={filtersExpanded}>
                  <div className="filter-section filter-section-compact">
                    <Group justify="space-between" align="center" mb="xs">
                      <div>
                        <Text fw={700} size="sm">
                          条件筛选
                        </Text>
                        <Text size="xs" c="dimmed">
                          支持整组条件按 AND / OR 组合，例如 `status = paid`、`amount &gt; 100`
                        </Text>
                      </div>
                      <Group gap="xs">
                        <Group gap={6} className="filter-join-toggle">
                          <Button
                            size="xs"
                            variant={filterJoinMode === 'and' ? 'light' : 'subtle'}
                            color={filterJoinMode === 'and' ? 'pink' : 'gray'}
                            onClick={() => onChangeFilterJoinMode('and')}
                          >
                            AND
                          </Button>
                          <Button
                            size="xs"
                            variant={filterJoinMode === 'or' ? 'light' : 'subtle'}
                            color={filterJoinMode === 'or' ? 'pink' : 'gray'}
                            onClick={() => onChangeFilterJoinMode('or')}
                          >
                            OR
                          </Button>
                        </Group>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="gray"
                          leftSection={<IconX size={14} />}
                          onClick={onClearFilters}
                        >
                          清空条件
                        </Button>
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
                    </Group>

                    <div className="filter-list-shell">
                      <Stack gap="sm" className="filter-list">
                        {filters.map((filter) => {
                          const selectedField = indexFieldMap[filter.field];
                          const allowedOperators = getAllowedFilterOperators(selectedField);
                          const selectableOperators = operatorOptions.filter((option) =>
                            allowedOperators.includes(option.value)
                          );
                          const fieldSupported = isFilterFieldSupported(selectedField);

                          return (
                            <div key={filter.id} className="filter-row">
                              <select
                                className="native-input filter-select filter-select-field"
                                value={filter.field}
                                onChange={(event) => {
                                  const nextFieldName = event.currentTarget.value;
                                  const nextField = indexFieldMap[nextFieldName];
                                  const nextAllowedOperators = getAllowedFilterOperators(nextField);
                                  const nextOperator = nextAllowedOperators[0] ?? filter.operator;

                                  onUpdateFilter(filter.id, {
                                    field: nextFieldName,
                                    operator: nextOperator,
                                    value: nextOperator === 'exists' || nextOperator === 'not_exists' ? '' : filter.value ?? ''
                                  });
                                }}
                              >
                                <option value="">请选择字段</option>
                                {indexFields.map((field) => {
                                  const supported = isFilterFieldSupported(field);
                                  const suffix = supported
                                    ? `${field.name} (${field.type})`
                                    : `${field.name} (${field.type}，暂不支持筛选)`;

                                  return (
                                    <option key={field.name} value={field.name} disabled={!supported}>
                                      {suffix}
                                    </option>
                                  );
                                })}
                              </select>
                              <select
                                className="native-input filter-select"
                                value={fieldSupported && allowedOperators.includes(filter.operator) ? filter.operator : ''}
                                disabled={!selectedField || !fieldSupported}
                                onChange={(event) =>
                                  onUpdateFilter(filter.id, { operator: event.currentTarget.value as FilterOperator })
                                }
                              >
                                {!selectedField ? <option value="">请先选择字段</option> : null}
                                {selectedField && !fieldSupported ? <option value="">当前类型暂不支持</option> : null}
                                {selectableOperators.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              {filter.operator !== 'exists' && filter.operator !== 'not_exists' && selectedField && fieldSupported ? (
                                <input
                                  className="native-input filter-input"
                                  placeholder="值，例如 paid / 100 / true"
                                  value={filter.value ?? ''}
                                  spellCheck={false}
                                  autoComplete="off"
                                  onChange={(event) => onUpdateFilter(filter.id, { value: event.currentTarget.value })}
                                />
                              ) : (
                                <div className="filter-placeholder">
                                  {filter.operator === 'exists' || filter.operator === 'not_exists'
                                    ? '不需要填写值'
                                    : selectedField && !fieldSupported
                                      ? '当前字段类型暂不支持筛选'
                                      : '请先选择字段'}
                                </div>
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
                          );
                        })}
                      </Stack>
                    </div>
                  </div>
                </Collapse>
              </Stack>
            </Stack>
          </div>
        </Stack>
      )}
    </Card>
  );
}
