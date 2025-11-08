/**
 * Tyco JavaScript/TypeScript Parser
 * Main entry point for the Tyco configuration language parser
 */

export { load, loads, TycoContext, TycoLexer, TycoStruct, TycoInstance, TycoValue, TycoArray, TycoReference } from './parser-new';

// Default export for convenience
export { load as default } from './parser-new';