/**
 * Tyco JavaScript/TypeScript Parser
 * Main entry point for the Tyco configuration language parser
 */

export { TycoParser, load, loads } from './parser';
export { TycoContext, TycoLexer, TycoStruct, TycoInstance, TycoValue, TycoArray, TycoReference } from './parser';

// Default export for convenience
export { load as default } from './parser';
