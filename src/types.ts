/**
 * Type definitions for the Tyco parser
 */

// Basic Tyco value types
export type TycoBaseType = 'str' | 'int' | 'float' | 'bool' | 'date' | 'time' | 'datetime';

// JavaScript representations of Tyco values
export type TycoValueType = string | number | boolean | Date | null;

// Parser configuration options
export interface TycoParserOptions {
  strict?: boolean;
  templateIterations?: number;
}

// Field schema definition
export interface TycoFieldSchema {
  type: TycoBaseType;
  isArray: boolean;
  isNullable: boolean;
  isPrimaryKey: boolean;
  hasDefault: boolean;
}

// Struct schema definition
export interface TycoStructSchema {
  typeName: string;
  fields: Map<string, TycoFieldSchema>;
  primaryKeys: string[];
  nullableKeys: Set<string>;
  arrayKeys: Set<string>;
}

// Template variable reference
export interface TycoTemplateRef {
  path: string[];
  isGlobal: boolean;
  isParent: boolean;
}

// Parsed Tyco content interfaces
export interface TycoGlobalValue {
  type: TycoBaseType;
  value: TycoValueType;
  isArray: boolean;
  isNullable: boolean;
  raw: string;
}

export interface TycoStructInstance {
  typeName: string;
  fields: Map<string, TycoValueType | TycoStructInstance | TycoValueType[]>;
  primaryKeyValues: TycoValueType[];
}

export interface TycoParseResult {
  globals: Map<string, TycoGlobalValue>;
  structs: Map<string, TycoStructSchema>;
  instances: Map<string, TycoStructInstance[]>;
}

// Export all classes that will be implemented
export { TycoParser } from './parser';
export { TycoLexer } from './lexer';
export { TycoContext } from './context';
export { TycoValue, TycoArray, TycoReference, TycoInstance } from './values';