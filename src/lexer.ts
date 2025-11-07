/**
 * Tyco Lexer - Handles tokenization and line-by-line parsing
 */

import {
  TycoBaseType,
  TycoValueType,
  TycoStructSchema,
  TycoStructInstance
} from './types';
import { TycoContext } from './context';
import { TycoValue, TycoArray, TycoReference, TycoInstance } from './values';

export interface TycoToken {
  type: 'global' | 'struct_header' | 'struct_field' | 'struct_instance' | 'comment' | 'blank';
  content: string;
  lineNumber: number;
}

export class TycoLexer {
  private lines: string[] = [];
  private currentLine = 0;
  private context: TycoContext;
  private defaults: Map<string, Map<string, any>> = new Map();

  // Regular expressions for parsing (based on Python implementation)
  private static readonly GLOBAL_REGEX = /^(\?)?(\w+)(\[\])?\s+(\w+)\s*:\s*(.*)$/;
  private static readonly STRUCT_HEADER_REGEX = /^(\w+):.*$/;
  private static readonly STRUCT_FIELD_REGEX = /^\s+([*?])?(\w+)(\[\])?\s+(\w+)\s*:\s*(.*)$/;
  private static readonly STRUCT_INSTANCE_REGEX = /^\s+-\s*(.*)$/;

  constructor(context: TycoContext, content: string) {
    this.context = context;
    this.lines = content.split('\n');
  }

  public static fromFile(context: TycoContext, content: string): TycoLexer {
    const lexer = new TycoLexer(context, content);
    lexer.process();
    return lexer;
  }

  public process(): void {
    while (this.hasMoreLines()) {
      const line = this.getCurrentLine();
      const stripped = this.stripComments(line);

      if (!stripped.trim()) {
        this.nextLine();
        continue;
      }

      if (this.isGlobalDeclaration(stripped)) {
        const consumed = this.parseGlobal(stripped);
        // If parseGlobal consumed additional lines, don't advance again
        if (!consumed) {
          this.nextLine();
        }
      } else if (this.isStructHeader(stripped)) {
        this.parseStruct(stripped);
        this.nextLine();
      } else {
        throw new Error(`Malformed config file at line ${this.currentLine + 1}: ${line}`);
      }
    }
  }

  private hasMoreLines(): boolean {
    return this.currentLine < this.lines.length;
  }

  private getCurrentLine(): string {
    return this.lines[this.currentLine] || '';
  }

  private nextLine(): void {
    this.currentLine++;
  }

  private peekLine(): string {
    return this.lines[this.currentLine + 1] || '';
  }

  private stripComments(line: string): string {
    const commentIndex = line.indexOf('#');
    if (commentIndex === -1) {
      return line;
    }
    return line.substring(0, commentIndex).trim();
  }

  private isGlobalDeclaration(line: string): boolean {
    return TycoLexer.GLOBAL_REGEX.test(line);
  }

  private isStructHeader(line: string): boolean {
    return TycoLexer.STRUCT_HEADER_REGEX.test(line);
  }

  private parseGlobal(line: string): boolean {
    const match = line.match(TycoLexer.GLOBAL_REGEX);
    if (!match) {
      throw new Error(`Invalid global declaration: ${line}`);
    }

    const nullable = match[1];
    const typeName = match[2];
    const arrayFlag = match[3];
    const attrName = match[4];
    let valueContent = match[5];
    
    const isArray = arrayFlag === '[]';
    const isNullable = nullable === '?';

    if (!attrName || !typeName) {
      throw new Error('Invalid global declaration format');
    }

    // Handle multiline strings
    let consumedLines = false;
    if (valueContent && (valueContent.trim().startsWith('"""') || valueContent.trim().startsWith("'''"))) {
      const result = this.parseMultilineString(valueContent.trim());
      valueContent = result.content;
      consumedLines = result.consumedLines;
    }

    if (!valueContent?.trim()) {
      throw new Error('Must provide a value when setting globals');
    }

    const value = this.parseValue(valueContent.trim(), typeName as TycoBaseType, isArray, isNullable);
    this.context.setGlobal(attrName, {
      type: typeName as TycoBaseType,
      value: value.getValue(),
      isArray,
      isNullable,
      raw: valueContent?.trim() || '',
    });

    return consumedLines;
  }

  private parseMultilineString(firstLine: string): { content: string; consumedLines: boolean } {
    const isTripleQuote = firstLine.startsWith('"""');
    const delimiter = isTripleQuote ? '"""' : "'''";
    
    // Check if it's a single-line multiline string (starts and ends on same line)
    if (firstLine.endsWith(delimiter) && firstLine !== delimiter) {
      // Single line case: remove the delimiters
      return {
        content: `"${firstLine.slice(delimiter.length, -delimiter.length)}"`,
        consumedLines: false
      };
    }
    
    // Multi-line case: collect lines until we find the closing delimiter
    const lines: string[] = [];
    
    // Read subsequent lines
    this.nextLine();
    while (this.hasMoreLines()) {
      const line = this.getCurrentLine();
      
      if (line.trim() === delimiter) {
        // Found closing delimiter on its own line
        this.nextLine(); // Consume the closing delimiter line
        break;
      }
      
      if (line.endsWith(delimiter)) {
        // Line ends with delimiter
        lines.push(line.slice(0, -delimiter.length));
        this.nextLine();
        break;
      }
      
      lines.push(line);
      this.nextLine();
    }
    
    // Join with newlines and add final newline, then wrap in quotes for processing
    const content = lines.join('\n') + (lines.length > 0 ? '\n' : '');
    return {
      content: `"${content}"`,
      consumedLines: true
    };
  }

  private parseStruct(line: string): void {
    const match = line.match(TycoLexer.STRUCT_HEADER_REGEX);
    if (!match) {
      throw new Error(`Invalid struct header: ${line}`);
    }

    const typeName = match[1]!;
    const struct = this.context.addStruct(typeName);
    
    // Initialize defaults for this struct type
    this.defaults.set(typeName, new Map());

    this.nextLine();
    this.parseStructSchema(struct);
    this.parseStructInstances(struct);
    this.currentLine--; // Adjust for the extra increment
  }

  private parseStructSchema(struct: any): void {
    while (this.hasMoreLines()) {
      const line = this.getCurrentLine();
      const stripped = this.stripComments(line);

      if (!stripped.trim()) {
        this.nextLine();
        continue;
      }

      const match = stripped.match(TycoLexer.STRUCT_FIELD_REGEX);
      if (!match) {
        // No more schema fields
        break;
      }

      const [, modifier, typeName, arrayFlag, attrName, defaultValue] = match;
      const isArray = arrayFlag === '[]';
      const isPrimaryKey = modifier === '*';
      const isNullable = modifier === '?';

      if (isPrimaryKey && isArray) {
        throw new Error('Cannot set a primary key on an array');
      }

      struct.addField(attrName!, {
        type: typeName as TycoBaseType,
        isArray,
        isNullable,
        isPrimaryKey,
        hasDefault: !!(defaultValue?.trim()),
      });

      if (defaultValue?.trim()) {
        const value = this.parseValue(defaultValue.trim(), typeName as TycoBaseType, isArray, isNullable);
        const defaults = this.defaults.get(struct.typeName)!;
        defaults.set(attrName!, value);
      }

      this.nextLine();
    }
  }

  private parseStructInstances(struct: any): void {
    while (this.hasMoreLines()) {
      const line = this.getCurrentLine();
      const stripped = this.stripComments(line);

      if (!stripped.trim()) {
        this.nextLine();
        continue;
      }

      if (!stripped.startsWith(' ')) {
        // Start of new struct or global
        break;
      }

      const match = stripped.match(TycoLexer.STRUCT_INSTANCE_REGEX);
      if (!match) {
        // Could be field defaults - skip for now
        this.nextLine();
        continue;
      }

      const instanceContent = match[1]!;
      this.parseStructInstance(struct, instanceContent);
      this.nextLine();
    }
  }

  private parseStructInstance(struct: any, content: string): void {
    const values: any[] = [];
    const parts = this.parseInstanceValues(content);

    for (const part of parts) {
      // Parse each value based on expected field types
      values.push(part);
    }

    const defaults = this.defaults.get(struct.typeName) || new Map();
    struct.addInstance(values, defaults);
  }

  private parseInstanceValues(content: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';
    let bracketDepth = 0;
    let parenDepth = 0;

    for (let i = 0; i < content.length; i++) {
      const char = content[i];

      if (!inQuotes) {
        if ((char === '"' || char === "'") && (i === 0 || content[i - 1] !== '\\')) {
          inQuotes = true;
          quoteChar = char;
          current += char;
        } else if (char === '[') {
          bracketDepth++;
          current += char;
        } else if (char === ']') {
          bracketDepth--;
          current += char;
        } else if (char === '(') {
          parenDepth++;
          current += char;
        } else if (char === ')') {
          parenDepth--;
          current += char;
        } else if (char === ',' && bracketDepth === 0 && parenDepth === 0) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      } else {
        current += char;
        if (char === quoteChar && (i === 0 || content[i - 1] !== '\\')) {
          inQuotes = false;
          quoteChar = '';
        }
      }
    }

    if (current.trim()) {
      values.push(current.trim());
    }

    return values;
  }

  private parseValue(content: string, type: TycoBaseType, isArray: boolean, isNullable: boolean): TycoValue {
    if (isNullable && content === 'null') {
      return new TycoValue(this.context, null, type, isArray, isNullable);
    }

    if (isArray) {
      return this.parseArrayValue(content, type, isNullable);
    }

    if (content.startsWith('"') || content.startsWith("'")) {
      return this.parseStringValue(content, type, isNullable);
    }

    if (content.includes('(')) {
      return this.parseReferenceValue(content, type, isNullable);
    }

    return this.parsePrimitiveValue(content, type, isNullable);
  }

  private parseArrayValue(content: string, type: TycoBaseType, isNullable: boolean): TycoValue {
    if (!content.startsWith('[') || !content.endsWith(']')) {
      throw new Error(`Array value must be enclosed in brackets: ${content}`);
    }

    const inner = content.slice(1, -1).trim();
    if (!inner) {
      return new TycoArray(this.context, [], type, isNullable) as any;
    }

    const elements = this.parseInstanceValues(inner);
    const parsedElements = elements.map(elem => 
      this.parseValue(elem, type, false, false)
    );

    return new TycoArray(this.context, parsedElements, type, isNullable) as any;
  }

  private parseStringValue(content: string, type: TycoBaseType, isNullable: boolean): TycoValue {
    let value = content;
    
    // Handle triple quotes
    if (content.startsWith('"""') || content.startsWith("'''")) {
      value = content.slice(3, -3);
      if (value.startsWith('\n')) {
        value = value.slice(1);
      }
    } else if (content.startsWith('"') || content.startsWith("'")) {
      value = content.slice(1, -1);
    }

    // Handle escape sequences
    value = this.processEscapeSequences(value);

    return new TycoValue(this.context, value, type, false, isNullable);
  }

  private parseReferenceValue(content: string, type: TycoBaseType, isNullable: boolean): TycoValue {
    const match = content.match(/^(\w+)\((.*)\)$/);
    if (!match) {
      throw new Error(`Invalid reference format: ${content}`);
    }

    const typeName = match[1];
    const argsContent = match[2];
    
    if (!typeName) {
      throw new Error(`Invalid reference format: ${content}`);
    }
    
    const args = argsContent ? this.parseInstanceValues(argsContent) : [];
    
    return new TycoReference(this.context, typeName, args, type, false, isNullable) as any;
  }

  private parsePrimitiveValue(content: string, type: TycoBaseType, isNullable: boolean): TycoValue {
    let value: any = content;

    switch (type) {
      case 'int':
        if (content.startsWith('0x')) {
          value = parseInt(content, 16);
        } else if (content.startsWith('0o')) {
          value = parseInt(content.slice(2), 8); // Remove '0o' prefix and parse as octal
        } else if (content.startsWith('0b')) {
          value = parseInt(content.slice(2), 2); // Remove '0b' prefix and parse as binary
        } else {
          value = parseInt(content, 10);
        }
        break;
      case 'float':
        value = parseFloat(content);
        break;
      case 'bool':
        if (content === 'true') {
          value = true;
        } else if (content === 'false') {
          value = false;
        } else {
          throw new Error(`Invalid boolean value: ${content}`);
        }
        break;
      case 'date':
        value = new Date(content + 'T00:00:00.000Z');
        break;
      case 'time':
        value = new Date(`1970-01-01T${content}.000Z`);
        break;
      case 'datetime':
        value = new Date(content);
        break;
      case 'str':
      default:
        // Already a string
        break;
    }

    return new TycoValue(this.context, value, type, false, isNullable);
  }

  private processEscapeSequences(str: string): string {
    return str
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
  }
}