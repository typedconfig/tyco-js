/**
 * Tyco JavaScript Parser
 * Main entry point for the Tyco configuration language parser
 */

export { TycoParser, load, loads } from './parser';
export { TycoContext } from './context';
export { TycoLexer } from './lexer';
export { TycoValue, TycoArray, TycoReference, TycoInstance } from './values';
export * from './types';

// Default export for convenience
export { load as default } from './parser';