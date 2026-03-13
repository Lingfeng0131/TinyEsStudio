import { useMemo } from 'react';
import { DataGrid, type CellMouseArgs, type RowsChangeData } from 'react-data-grid';
import type { EsDocument } from '../../../shared/types';
import type { DirtyState, GridRow } from '../types';
import { buildColumns, collectFieldNames } from '../utils/documentTable';

interface DocumentsGridProps {
  rows: GridRow[];
  documents: EsDocument[];
  dirtyState: DirtyState;
  selectedRowKey?: string;
  onRowsChange: (rows: GridRow[], change: RowsChangeData<GridRow, unknown>) => void;
  onSelectRow: (rowKey: string) => void;
}

export function DocumentsGrid({
  rows,
  documents,
  dirtyState,
  selectedRowKey,
  onRowsChange,
  onSelectRow
}: DocumentsGridProps) {
  const originalMap = useMemo(
    () =>
      documents.reduce<Record<string, EsDocument>>((accumulator, document) => {
        accumulator[document._id] = document;
        return accumulator;
      }, {}),
    [documents]
  );

  const editableFields = useMemo(() => {
    return collectFieldNames(documents);
  }, [documents]);

  const columns = useMemo(() => buildColumns(editableFields, dirtyState, originalMap), [dirtyState, editableFields, originalMap]);

  return (
    <div className="grid-shell">
      <DataGrid
        className="elastic-grid"
        columns={columns}
        rows={rows}
        rowKeyGetter={(row) => row._rowKey}
        onRowsChange={onRowsChange}
        onCellClick={(args: CellMouseArgs<GridRow>) => {
          onSelectRow(args.row._rowKey);
          if (args.column.key !== '_id') {
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
