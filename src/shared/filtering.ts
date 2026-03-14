import type { FilterOperator, IndexFieldOption } from './types';

const TEXT_FIELD_TYPES = new Set([
  'text',
  'keyword',
  'constant_keyword',
  'wildcard',
  'match_only_text'
]);

const NUMERIC_FIELD_TYPES = new Set([
  'byte',
  'short',
  'integer',
  'long',
  'unsigned_long',
  'half_float',
  'float',
  'double',
  'scaled_float'
]);

const BOOLEAN_FIELD_TYPES = new Set(['boolean']);

const ORDERED_TERM_FIELD_TYPES = new Set(['date', 'date_nanos', 'ip', 'version']);

export function getAllowedFilterOperators(field?: Pick<IndexFieldOption, 'type' | 'filterScope'>): FilterOperator[] {
  if (!field) {
    return [];
  }

  if (field.filterScope === 'nested') {
    return [];
  }

  if (field.type === 'metadata') {
    return ['contains', 'eq', 'exists'];
  }

  if (TEXT_FIELD_TYPES.has(field.type)) {
    return ['contains', 'eq', 'exists', 'not_exists'];
  }

  if (NUMERIC_FIELD_TYPES.has(field.type)) {
    return ['eq', 'gt', 'gte', 'lt', 'lte', 'exists', 'not_exists'];
  }

  if (BOOLEAN_FIELD_TYPES.has(field.type)) {
    return ['eq', 'exists', 'not_exists'];
  }

  if (ORDERED_TERM_FIELD_TYPES.has(field.type)) {
    return ['eq', 'gt', 'gte', 'lt', 'lte', 'exists', 'not_exists'];
  }

  return [];
}

export function isFilterOperatorSupported(
  field: Pick<IndexFieldOption, 'type' | 'filterScope'> | undefined,
  operator: FilterOperator
): boolean {
  return getAllowedFilterOperators(field).includes(operator);
}

export function isFilterFieldSupported(field?: Pick<IndexFieldOption, 'type' | 'filterScope'>): boolean {
  return getAllowedFilterOperators(field).length > 0;
}
