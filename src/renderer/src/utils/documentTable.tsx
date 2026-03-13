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

function inferColumnWidth(field: string): number {
  if (field === '_id') return 220;
  return Math.max(150, Math.min(260, field.length * 14 + 72));
}

function commitEditorChange(
  props: RenderEditCellProps<GridRow, unknown>,
  field: string,
  nextValue: PrimitiveValue | string
): void {
  props.onRowChange({ ...props.row, [field]: nextValue });
}

function renderEditor(
  props: RenderEditCellProps<GridRow, unknown>,
  field: string,
  originalValue: PrimitiveValue | undefined
) {
  if (typeof originalValue === 'boolean') {
    return (
      <select
        className="grid-editor grid-editor-select"
        autoFocus
        value={String(props.row[field] ?? originalValue)}
        onChange={(event) => {
          commitEditorChange(props, field, event.target.value === 'true');
          props.onClose(true, true);
        }}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  const inputType = typeof originalValue === 'number' ? 'number' : 'text';
  const value = props.row[field] === null ? '' : String(props.row[field] ?? '');

  const handleChange = (
    event: ChangeEvent<HTMLInputElement>
  ): void => {
    const { value: nextValue } = event.currentTarget;
    commitEditorChange(props, field, nextValue);
  };

  return (
    <input
      className="grid-editor"
      autoFocus
      type={inputType}
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
  originalMap: Record<string, EsDocument>
): Column<GridRow>[] {
  const fixedColumns: Column<GridRow>[] = [
    {
      key: '_id',
      name: '_id',
      resizable: true,
      frozen: true,
      width: inferColumnWidth('_id')
    }
  ];

  const editableColumns: Column<GridRow>[] = fields.map((field) => ({
    key: field,
    name: field,
    editable: true,
    resizable: true,
    width: inferColumnWidth(field),
    renderCell: ({ row }) => {
      const rowDirty = dirtyState[row._id];
      const isDirty = Boolean(rowDirty && field in rowDirty);
      const rawValue = row[field];
      const originalValue = getPrimitiveValueByPath(originalMap[row._id]?._source ?? {}, field);
      const isBoolean = typeof originalValue === 'boolean';

      if (isBoolean) {
        return (
          <div className={isDirty ? 'grid-cell grid-cell-dirty' : 'grid-cell'}>
            {rawValue === true ? 'true' : rawValue === false ? 'false' : ''}
          </div>
        );
      }

      return (
        <div className={isDirty ? 'grid-cell grid-cell-dirty' : 'grid-cell'}>
          {String(rawValue ?? '')}
        </div>
      );
    },
    renderEditCell: (props) =>
      renderEditor(props as RenderEditCellProps<GridRow, unknown>, field, getPrimitiveValueByPath(originalMap[props.row._id]?._source ?? {}, field))
  }));

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
