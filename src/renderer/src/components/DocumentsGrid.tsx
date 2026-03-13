import { useEffect, useMemo, useRef } from 'react';
import { DataGrid, type CellMouseArgs, type RowsChangeData } from 'react-data-grid';
import type { EsDocument } from '../../../shared/types';
import type { DirtyState, GridRow } from '../types';
import { buildColumns } from '../utils/documentTable';

interface DocumentsGridProps {
  compact?: boolean;
  fields: string[];
  rows: GridRow[];
  documents: EsDocument[];
  dirtyState: DirtyState;
  selectedRowKey?: string;
  checkedRowKey?: string;
  fieldTypeMap: Record<string, string>;
  scrollToTopSignal: number;
  onRowsChange: (rows: GridRow[], change: RowsChangeData<GridRow, unknown>) => void;
  onSelectRow: (rowKey: string) => void;
  onToggleDeleteCheck: (rowKey: string, checked: boolean) => void;
}

export function DocumentsGrid({
  compact = false,
  fields,
  rows,
  documents,
  dirtyState,
  selectedRowKey,
  checkedRowKey,
  fieldTypeMap,
  scrollToTopSignal,
  onRowsChange,
  onSelectRow,
  onToggleDeleteCheck
}: DocumentsGridProps) {
  const gridShellRef = useRef<HTMLDivElement | null>(null);
  const originalMap = useMemo(
    () =>
      documents.reduce<Record<string, EsDocument>>((accumulator, document) => {
        accumulator[document._id] = document;
        return accumulator;
      }, {}),
    [documents]
  );

  const columns = useMemo(
    () => buildColumns(fields, dirtyState, originalMap, fieldTypeMap, checkedRowKey, onToggleDeleteCheck),
    [checkedRowKey, dirtyState, fieldTypeMap, fields, onToggleDeleteCheck, originalMap]
  );

  useEffect(() => {
    const container = gridShellRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = 0;
    const viewport = container.querySelector<HTMLElement>('.rdg');
    if (viewport) {
      viewport.scrollTop = 0;
    }
  }, [scrollToTopSignal]);

  return (
    <div ref={gridShellRef} className={compact ? 'grid-shell grid-shell-compact' : 'grid-shell'}>
      <DataGrid
        className={compact ? 'elastic-grid elastic-grid-compact' : 'elastic-grid'}
        columns={columns}
        rows={rows}
        rowKeyGetter={(row) => row._rowKey}
        onRowsChange={onRowsChange}
        onCellClick={(args: CellMouseArgs<GridRow>) => {
          onSelectRow(args.row._rowKey);
          const shouldOpenEditor =
            args.column.key !== '_deleteCheck' && (args.column.key !== '_id' || args.row._isDraft === true);

          if (shouldOpenEditor) {
            args.selectCell(true);
          }
        }}
        rowClass={(row: GridRow) => (row._rowKey === selectedRowKey ? 'grid-row-selected' : undefined)}
        defaultColumnOptions={{
          sortable: false,
          resizable: true
        }}
      />
    </div>
  );
}
