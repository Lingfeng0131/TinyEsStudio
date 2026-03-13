import type { PrimitiveValue } from '../../shared/types';

export type GridRow = {
  _rowKey: string;
  _id: string;
} & Record<string, PrimitiveValue | string>;

export interface DirtyState {
  [documentId: string]: Record<string, PrimitiveValue>;
}
