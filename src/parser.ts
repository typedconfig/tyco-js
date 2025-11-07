/**
 * TycoParser - Main parser class for Tyco configuration files
 */

import { readFileSync } from 'fs';
import { TycoContext } from './context';
import { TycoLexer } from './lexer';
import { TycoParserOptions } from './types';

export class TycoParser {
  private context: TycoContext;
  private options: TycoParserOptions;

  constructor(options: TycoParserOptions = {}) {
    this.context = new TycoContext();
    this.options = {
      strict: options.strict ?? true,
      templateIterations: options.templateIterations ?? 10,
    };
  }

  public static parse(content: string, options?: TycoParserOptions): any {
    const parser = new TycoParser(options);
    return parser.parseContent(content);
  }

  public static parseFile(filePath: string, options?: TycoParserOptions): any {
    const content = readFileSync(filePath, 'utf-8');
    return TycoParser.parse(content, options);
  }

  public parseContent(content: string): any {
    // Phase 1: Lexical analysis and basic parsing
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const lexer = TycoLexer.fromFile(this.context, content);

    // Phase 2: Template expansion and reference resolution
    this.resolveReferences();
    this.expandTemplates();

    // Return the parsed result
    return this.context.getResult();
  }

  public parseFile(filePath: string): any {
    const content = readFileSync(filePath, 'utf-8');
    return this.parseContent(content);
  }

  private resolveReferences(): void {
    // Resolve all struct references
    // This would iterate through all instances and resolve TycoReference objects
    // Implementation depends on the complete context structure
  }

  private expandTemplates(): void {
    // Expand all template variables
    let iterations = 0;
    const maxIterations = this.options.templateIterations || 10;

    while (iterations < maxIterations) {
      let hasChanges = false;

      // Template expansion logic would go here
      // This would process all {variable} substitutions

      if (!hasChanges) {
        break;
      }

      iterations++;
    }

    if (iterations >= maxIterations) {
      throw new Error('Template expansion exceeded maximum iterations - possible circular reference');
    }
  }

  public getContext(): TycoContext {
    return this.context;
  }
}

// Main export functions for convenience
export function load(filePath: string, options?: TycoParserOptions): any {
  return TycoParser.parseFile(filePath, options);
}

export function loads(content: string, options?: TycoParserOptions): any {
  return TycoParser.parse(content, options);
}