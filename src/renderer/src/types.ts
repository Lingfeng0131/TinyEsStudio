import type { PrimitiveValue } from '../../shared/types';

export type GridRow = {
  _rowKey: string;
  _id: string;
  _isDraft?: boolean;
} & Record<string, PrimitiveValue | string | boolean | undefined>;

export interface DirtyState {
  [documentId: string]: Record<string, PrimitiveValue>;
}
