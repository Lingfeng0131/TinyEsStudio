import { type ChangeEvent } from 'react';
import type { Column, RenderEditCellProps } from 'react-data-grid';
import type { EsDocument, PrimitiveValue } from '../../../shared/types';
import type { DirtyState, GridRow } from '../types';

function isPrimitiveValue(value: unknown): value is PrimitiveValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function flattenPrimitiveEntries(
  source: Record<string, unknown>,
  prefix = ''
): Array<[string, PrimitiveValue]> {
  const entries: Array<[string, PrimitiveValue]> = [];

  Object.entries(source).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    if (isPrimitiveValue(value)) {
      entries.push([path, value]);
      return;
    }

    if (isPlainObject(value)) {
      entries.push(...flattenPrimitiveEntries(value, path));
    }
  });

  return entries;
}

export function getPrimitiveValueByPath(
  source: Record<string, unknown>,
  path: string
): PrimitiveValue | undefined {
  const segments = path.split('.');
  let current: unknown = source;

  for (const segment of segments) {
    if (!isPlainObject(current) || !(segment in current)) {
      return undefined;
    }

    current = current[segment];
  }

  return isPrimitiveValue(current) ? current : undefined;
}

export function collectFieldNames(documents: EsDocument[]): string[] {
  const fieldSet = new Set<string>();

  documents.forEach((document) => {
    flattenPrimitiveEntries(document._source).forEach(([path]) => {
      fieldSet.add(path);
    });
  });

  return Array.from(fieldSet).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function toGridRows(documents: EsDocument[], fields: string[]): GridRow[] {
  return documents.map((document) => {
    const row: GridRow = {
      _rowKey: `${document._index}:${document._id}`,
      _id: document._id
    };

    fields.forEach((field) => {
      const value = getPrimitiveValueByPath(document._source, field);
      row[field] = value ?? '';
    });

    return row;
  });
}

export function toGridRow(document: EsDocument, fields: string[]): GridRow {
  return toGridRows([document], fields)[0];
}

function inferColumnSizing(field: string, fieldType?: string): {
  width: string;
  minWidth: number;
} {
  const normalizedField = field.toLowerCase();

  if (field === '_id') {
    return {
      width: '1.3fr',
      minWidth: 220
    };
  }

  if (
    normalizedField.includes('time') ||
    normalizedField.includes('date') ||
    fieldType === 'date'
  ) {
    return {
      width: '1.15fr',
      minWidth: 170
    };
  }

  if (
    normalizedField.includes('phone') ||
    normalizedField.includes('mobile') ||
    normalizedField.includes('tel')
  ) {
    return {
      width: '1.1fr',
      minWidth: 160
    };
  }

  if (
    fieldType === 'boolean' ||
    isNumericFieldType(fieldType) ||
    normalizedField === 'age' ||
    normalizedField.includes('count') ||
    normalizedField.includes('num') ||
    normalizedField.includes('amount') ||
    normalizedField.includes('price')
  ) {
    return {
      width: '0.95fr',
      minWidth: 96
    };
  }

  if (
    normalizedField.includes('name') ||
    normalizedField.includes('title') ||
    normalizedField.includes('nick')
  ) {
    return {
      width: '1fr',
      minWidth: 140
    };
  }

  return {
    width: '1fr',
    minWidth: 150
  };
}

function isNumericFieldType(fieldType: string | undefined): boolean {
  return ['byte', 'short', 'integer', 'long', 'unsigned_long', 'half_float', 'float', 'double', 'scaled_float'].includes(
    fieldType ?? ''
  );
}

function isDateFieldType(fieldType: string | undefined, field: string): boolean {
  if (fieldType === 'date' || fieldType === 'date_nanos') {
    return true;
  }

  const normalizedField = field.toLowerCase();
  return normalizedField.includes('time') || normalizedField.includes('date');
}

function padNumber(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

function formatJavaDatePattern(date: Date, pattern: string): string {
  const tokenMap: Array<[string, string]> = [
    ['yyyy', String(date.getFullYear())],
    ['SSSSSSSSS', `${padNumber(date.getMilliseconds(), 3)}000000`],
    ['SSS', padNumber(date.getMilliseconds(), 3)],
    ['MM', padNumber(date.getMonth() + 1)],
    ['dd', padNumber(date.getDate())],
    ['HH', padNumber(date.getHours())],
    ['mm', padNumber(date.getMinutes())],
    ['ss', padNumber(date.getSeconds())],
    ['M', String(date.getMonth() + 1)],
    ['d', String(date.getDate())],
    ['H', String(date.getHours())],
    ['m', String(date.getMinutes())],
    ['s', String(date.getSeconds())],
    ['S', String(Math.floor(date.getMilliseconds() / 100))]
  ];

  let result = '';
  let cursor = 0;

  while (cursor < pattern.length) {
    if (pattern[cursor] === '\'') {
      cursor += 1;

      while (cursor < pattern.length) {
        if (pattern[cursor] === '\'') {
          if (pattern[cursor + 1] === '\'') {
            result += '\'';
            cursor += 2;
            continue;
          }

          cursor += 1;
          break;
        }

        result += pattern[cursor];
        cursor += 1;
      }

      continue;
    }

    const matchedToken = tokenMap.find(([token]) => pattern.startsWith(token, cursor));
    if (matchedToken) {
      result += matchedToken[1];
      cursor += matchedToken[0].length;
      continue;
    }

    result += pattern[cursor];
    cursor += 1;
  }

  return result;
}

function inferDateFormatHint(sampleValue: string | undefined): string | undefined {
  if (!sampleValue) {
    return undefined;
  }

  const text = sampleValue.trim();
  if (!text) {
    return undefined;
  }

  if (/^\d{13}$/.test(text)) {
    return 'epoch_millis';
  }

  if (/^\d{10}$/.test(text)) {
    return 'epoch_second';
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{9}Z$/.test(text)) {
    return '__iso_z_nanos__';
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(text)) {
    return '__iso_z_millis__';
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(text)) {
    return '__iso_z_seconds__';
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{9}$/.test(text)) {
    return "yyyy-MM-dd'T'HH:mm:ss.SSSSSSSSS";
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/.test(text)) {
    return "yyyy-MM-dd'T'HH:mm:ss.SSS";
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(text)) {
    return "yyyy-MM-dd'T'HH:mm:ss";
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    return 'yyyy-MM-dd HH:mm:ss';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return 'strict_date';
  }

  if (/^\d{8}$/.test(text)) {
    return 'basic_date';
  }

  return undefined;
}

function resolveDateFormatHint(...candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    if (inferDateFormatHint(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function formatIsoWithPrecision(date: Date, fractionDigits: 0 | 3 | 9): string {
  const isoBase = date.toISOString().replace(/\.\d{3}Z$/, '');

  if (fractionDigits === 0) {
    return `${isoBase}Z`;
  }

  if (fractionDigits === 9) {
    return `${isoBase}.${padNumber(date.getMilliseconds(), 3)}000000Z`;
  }

  return date.toISOString();
}

function formatDateByFieldFormat(
  date: Date,
  fieldType?: string,
  fieldFormat?: string,
  dateFormatHint?: string
): string {
  const preferredHint = inferDateFormatHint(dateFormatHint);

  if (preferredHint === '__iso_z_nanos__') {
    return formatIsoWithPrecision(date, 9);
  }

  if (preferredHint === '__iso_z_millis__') {
    return formatIsoWithPrecision(date, 3);
  }

  if (preferredHint === '__iso_z_seconds__') {
    return formatIsoWithPrecision(date, 0);
  }

  if (preferredHint && !preferredHint.startsWith('__')) {
    return formatDateByFieldFormat(date, fieldType, preferredHint);
  }

  const formatCandidates = fieldFormat
    ?.split('||')
    .map((item) => item.trim())
    .filter(Boolean);
  const preferredFormat =
    formatCandidates?.find((item) => item !== 'epoch_millis' && item !== 'epoch_second') ??
    formatCandidates?.[0];

  if (!preferredFormat) {
    if (fieldType === 'date_nanos') {
      return `${date.toISOString().replace('Z', '')}000000Z`;
    }

    return formatJavaDatePattern(date, 'yyyy-MM-dd HH:mm:ss');
  }

  if (preferredFormat === 'epoch_millis') {
    return String(date.getTime());
  }

  if (preferredFormat === 'epoch_second') {
    return String(Math.floor(date.getTime() / 1000));
  }

  if (
    preferredFormat === 'strict_date_optional_time' ||
    preferredFormat === 'date_optional_time' ||
    preferredFormat === 'strict_date_time' ||
    preferredFormat === 'strict_date_time_no_millis' ||
    preferredFormat === 'strict_date_optional_time_nanos' ||
    preferredFormat === 'date_optional_time_nanos'
  ) {
    if (fieldType === 'date_nanos' || preferredFormat.includes('nanos')) {
      return `${date.toISOString().replace('Z', '')}000000Z`;
    }

    return date.toISOString();
  }

  if (preferredFormat === 'strict_date') {
    return formatJavaDatePattern(date, 'yyyy-MM-dd');
  }

  if (preferredFormat === 'basic_date') {
    return formatJavaDatePattern(date, 'yyyyMMdd');
  }

  return formatJavaDatePattern(date, preferredFormat);
}

function buildDatePlaceholder(fieldType?: string, fieldFormat?: string, dateFormatHint?: string): string {
  const sampleDate = new Date(2026, 2, 14, 10, 0, 0, 123);
  return `例如 ${formatDateByFieldFormat(sampleDate, fieldType, fieldFormat, dateFormatHint)}`;
}

function buildDateQuickOptions(
  value: string,
  fieldType?: string,
  fieldFormat?: string,
  dateFormatHint?: string
): Array<{ label: string; value: string }> {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const options = [
    { label: '现在', value: formatDateByFieldFormat(now, fieldType, fieldFormat, dateFormatHint) },
    { label: '今天 00:00', value: formatDateByFieldFormat(startOfToday, fieldType, fieldFormat, dateFormatHint) },
    { label: '今天 23:59', value: formatDateByFieldFormat(endOfToday, fieldType, fieldFormat, dateFormatHint) },
    { label: '昨天 00:00', value: formatDateByFieldFormat(startOfYesterday, fieldType, fieldFormat, dateFormatHint) }
  ];

  if (value.trim()) {
    options.unshift({ label: '保留当前值', value });
  }

  return options.filter(
    (option, index, list) => list.findIndex((candidate) => candidate.value === option.value) === index
  );
}

export function normalizeValueByFieldType(value: unknown, fieldType: string | undefined): PrimitiveValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (fieldType === 'boolean') {
    if (typeof value === 'boolean') {
      return value;
    }

    const text = String(value).trim().toLowerCase();
    if (!text) {
      return undefined;
    }
    if (text === 'true' || text === '1') return true;
    if (text === 'false' || text === '0') return false;
    return String(value);
  }

  if (value === '') {
    return undefined;
  }

  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  return String(value);
}

function commitEditorChange(
  props: RenderEditCellProps<GridRow, unknown>,
  field: string,
  nextValue: PrimitiveValue | string,
  commitChanges = false
): void {
  props.onRowChange({ ...props.row, [field]: nextValue }, commitChanges);
}

function renderEditor(
  props: RenderEditCellProps<GridRow, unknown>,
  field: string,
  originalValue: PrimitiveValue | undefined,
  fieldType?: string,
  fieldFormat?: string,
  fieldDateFormatHint?: string
) {
  if (typeof originalValue === 'boolean' || fieldType === 'boolean') {
    return (
      <select
        className="grid-editor grid-editor-select"
        autoFocus
        value={String(props.row[field] ?? originalValue ?? '')}
        onChange={(event) => {
          const nextValue = event.target.value;
          commitEditorChange(props, field, nextValue === '' ? '' : nextValue === 'true', true);
        }}
        onBlur={() => props.onClose(false, true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            props.onClose(false, true);
          }
        }}
      >
        <option value="">请选择</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  const value = props.row[field] === null ? '' : String(props.row[field] ?? '');
  const isDateField = isDateFieldType(fieldType, field);
  const dateSuggestionId = `grid-date-suggestions-${props.row._rowKey.replace(/[^a-zA-Z0-9_-]/g, '-')}-${field.replace(
    /[^a-zA-Z0-9_-]/g,
    '-'
  )}`;
  const activeDateFormatHint = resolveDateFormatHint(
    typeof props.row[field] === 'string' ? String(props.row[field]).trim() : undefined,
    typeof originalValue === 'string' ? originalValue.trim() : undefined,
    fieldDateFormatHint
  );
  const dateQuickOptions = buildDateQuickOptions(value, fieldType, fieldFormat, activeDateFormatHint);

  const handleChange = (
    event: ChangeEvent<HTMLInputElement>
  ): void => {
    const { value: nextValue } = event.currentTarget;
    commitEditorChange(props, field, nextValue);
  };

  if (isDateField) {
    return (
      <div className="grid-date-editor-shell">
        <input
          className="grid-editor grid-editor-date"
          autoFocus
          type="text"
          list={dateSuggestionId}
          value={value}
          placeholder={buildDatePlaceholder(fieldType, fieldFormat, activeDateFormatHint)}
          onChange={handleChange}
          onBlur={() => props.onClose(true, true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              props.onClose(true, true);
            }
            if (event.key === 'Escape') {
              props.onClose(false, true);
            }
          }}
        />
        <datalist id={dateSuggestionId}>
          {dateQuickOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </datalist>
        <div className="grid-date-editor-actions">
          {dateQuickOptions.map((option) => (
            <button
              key={option.label}
              type="button"
              className="grid-date-chip"
              tabIndex={-1}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                commitEditorChange(props, field, option.value);
                props.onClose(true, true);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <input
      className="grid-editor"
      autoFocus
      type="text"
      value={value}
      onChange={handleChange}
      onBlur={() => props.onClose(true, true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          props.onClose(true, true);
        }
        if (event.key === 'Escape') {
          props.onClose(false, true);
        }
      }}
    />
  );
}

export function buildColumns(
  fields: string[],
  dirtyState: DirtyState,
  originalMap: Record<string, EsDocument>,
  fieldTypeMap: Record<string, string>,
  fieldFormatMap: Record<string, string>,
  fieldDateFormatHintMap: Record<string, string>,
  checkedRowKeys: string[],
  onToggleCheck: (rowKey: string, checked: boolean) => void
): Column<GridRow>[] {
  const checkedRowKeySet = new Set(checkedRowKeys);
  const fixedColumns: Column<GridRow>[] = [
    {
      key: '_deleteCheck',
      name: '',
      frozen: true,
      resizable: false,
      width: 54,
      renderCell: ({ row }) => (
        <div className="grid-checkbox-cell">
          <input
            className="grid-delete-checkbox"
            type="checkbox"
            checked={checkedRowKeySet.has(row._rowKey)}
            aria-label={`勾选文档 ${row._id} 以允许删除`}
            onChange={(event) => {
              event.stopPropagation();
              onToggleCheck(row._rowKey, event.currentTarget.checked);
            }}
            onClick={(event) => {
              event.stopPropagation();
            }}
          />
        </div>
      )
    },
    {
      key: '_id',
      name: '_id',
      editable: (row) => row._isDraft === true,
      resizable: true,
      frozen: true,
      width: inferColumnSizing('_id').width,
      minWidth: inferColumnSizing('_id').minWidth,
      renderCell: ({ row }) => (
        <div className={row._isDraft ? 'grid-cell grid-cell-draft' : 'grid-cell'}>
          {String(row._id ?? '')}
        </div>
      ),
      renderEditCell: (props) => renderEditor(props as RenderEditCellProps<GridRow, unknown>, '_id', undefined)
    }
  ];

  const editableColumns: Column<GridRow>[] = fields.map((field) => {
    const sizing = inferColumnSizing(field, fieldTypeMap[field]);

    return {
      key: field,
      name: field,
      editable: true,
      resizable: true,
      width: sizing.width,
      minWidth: sizing.minWidth,
      renderCell: ({ row }) => {
      const rowDirty = dirtyState[row._id];
      const isDirty = Boolean(rowDirty && field in rowDirty);
      const rawValue = row[field];
      const originalValue = getPrimitiveValueByPath(originalMap[row._id]?._source ?? {}, field);
      const isBoolean = typeof originalValue === 'boolean' || fieldTypeMap[field] === 'boolean';

      if (isBoolean) {
        return (
          <div className={isDirty || row._isDraft ? 'grid-cell grid-cell-dirty' : 'grid-cell'}>
            {rawValue === true ? 'true' : rawValue === false ? 'false' : ''}
          </div>
        );
      }

      return (
        <div className={isDirty || row._isDraft ? 'grid-cell grid-cell-dirty' : 'grid-cell'}>
          {String(rawValue ?? '')}
        </div>
      );
      },
      renderEditCell: (props) =>
        renderEditor(
          props as RenderEditCellProps<GridRow, unknown>,
          field,
          getPrimitiveValueByPath(originalMap[props.row._id]?._source ?? {}, field),
          fieldTypeMap[field],
          fieldFormatMap[field],
          fieldDateFormatHintMap[field]
        )
    };
  });

  return [...fixedColumns, ...editableColumns];
}

export function normalizeCellValue(
  nextValue: unknown,
  originalValue: unknown
): PrimitiveValue | undefined {
  if (
    !(
      originalValue === null ||
      typeof originalValue === 'string' ||
      typeof originalValue === 'number' ||
      typeof originalValue === 'boolean'
    )
  ) {
    return undefined;
  }

  if (typeof originalValue === 'number') {
    if (nextValue === '') {
      return null;
    }

    const parsed = Number(nextValue);
    if (Number.isNaN(parsed)) {
      throw new Error('数字字段只能输入数字');
    }
    return parsed;
  }

  if (typeof originalValue === 'boolean') {
    if (typeof nextValue === 'boolean') {
      return nextValue;
    }

    const text = String(nextValue).trim().toLowerCase();
    if (text === 'true' || text === '1') return true;
    if (text === 'false' || text === '0') return false;
    throw new Error('布尔字段请输入 true / false');
  }

  if (nextValue === '') {
    return originalValue === null ? null : '';
  }

  return String(nextValue);
}

function setNestedValue(
  target: Record<string, unknown>,
  path: string,
  value: PrimitiveValue
): void {
  const segments = path.split('.');
  let current: Record<string, unknown> = target;

  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1;

    if (isLast) {
      current[segment] = value;
      return;
    }

    if (!isPlainObject(current[segment])) {
      current[segment] = {};
    }

    current = current[segment] as Record<string, unknown>;
  });
}

export function buildPartialDocument(changes: Record<string, PrimitiveValue>): Record<string, unknown> {
  const document: Record<string, unknown> = {};

  Object.entries(changes).forEach(([field, value]) => {
    setNestedValue(document, field, value);
  });

  return document;
}

export function applyChangesToDocumentSource(
  source: Record<string, unknown>,
  changes: Record<string, PrimitiveValue>
): Record<string, unknown> {
  const nextSource = JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
  Object.entries(changes).forEach(([field, value]) => {
    setNestedValue(nextSource, field, value);
  });
  return nextSource;
}

export function buildDocumentFromGridRow(
  row: GridRow,
  fields: string[],
  _fieldTypeMap: Record<string, string>
): Record<string, unknown> {
  const document: Record<string, unknown> = {};

  fields.forEach((field) => {
    const rawValue = row[field];
    if (rawValue === undefined || rawValue === '') {
      return;
    }

    if (rawValue === null || typeof rawValue === 'string' || typeof rawValue === 'number' || typeof rawValue === 'boolean') {
      setNestedValue(document, field, rawValue);
      return;
    }

    setNestedValue(document, field, String(rawValue));
  });

  return document;
}
