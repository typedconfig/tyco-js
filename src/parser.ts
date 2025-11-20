/**
 * Tyco Parser - TypeScript/JavaScript Implementation
 * Mirrors the Python reference implementation architecture
 * 
 * Main entry points: load(path) and loads(content)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TycoParserOptions } from './types';
import { TycoError, SourceLocation } from './errors';
import { SourceFragment, coerceContentToFragments } from './source';

const EOL = os.EOL;

// ============================================================================
// Utility Functions
// ============================================================================

const ASCII_CTRL = new Set<string>();
for (let i = 0; i < 32; i++) ASCII_CTRL.add(String.fromCharCode(i));
ASCII_CTRL.add(String.fromCharCode(127));

const ILLEGAL_STR_CHARS = new Set([...ASCII_CTRL]);
ILLEGAL_STR_CHARS.delete('\t');

const ILLEGAL_STR_CHARS_MULTILINE = new Set([...ASCII_CTRL]);
ILLEGAL_STR_CHARS_MULTILINE.delete('\r');
ILLEGAL_STR_CHARS_MULTILINE.delete('\n');
ILLEGAL_STR_CHARS_MULTILINE.delete('\t');

const BASIC_STR_ESCAPE_ENTRIES: Array<[string, string]> = [
  ['\\\\', '\u005C'], // backslash
  ['\\"', '\u0022'],  // quote
  ['\\b', '\u0008'],  // backspace
  ['\\t', '\u0009'],  // tab
  ['\\n', '\u000A'],  // linefeed
  ['\\f', '\u000C'],  // form feed
  ['\\r', '\u000D'],  // carriage return
];
const BASIC_STR_ESCAPE_REGEX = new RegExp(`(?:${BASIC_STR_ESCAPE_ENTRIES.map(([pattern]) => pattern.replace(/\\/g, '\\\\')).join('|')})`, 'g');
const BASIC_STR_ESCAPE_LOOKUP = new Map(BASIC_STR_ESCAPE_ENTRIES);

function subEscapeSequences(content: string): string {
  let escaped = content.replace(BASIC_STR_ESCAPE_REGEX, match => BASIC_STR_ESCAPE_LOOKUP.get(match) ?? match);

  escaped = escaped.replace(/\\u([0-9a-fA-F]{4})|\\U([0-9a-fA-F]{8})/g, (_match, u4, u8) => {
    const hex = u4 || u8;
    return String.fromCodePoint(parseInt(hex, 16));
  });

  escaped = escaped.replace(/\\\s*\r?\n\s*/g, '');

  return escaped;
}

function normalizeTimeLiteral(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{2}:\d{2}:\d{2})(\.(\d+))?$/);
  if (!match) {
    return trimmed;
  }
  const base = match[1] ?? trimmed;
  if (!match[2]) {
    return base;
  }
  const rawFraction = match[3] ?? '';
  const fraction = rawFraction.padEnd(6, '0').slice(0, 6);
  return `${base}.${fraction}`;
}

function normalizeDateTimeLiteral(value: string): string {
  let normalized = value.trim();
  if (normalized.includes(' ')) {
    const firstSpace = normalized.indexOf(' ');
    normalized = `${normalized.slice(0, firstSpace)}T${normalized.slice(firstSpace + 1)}`;
  }

  let tz = '';
  if (normalized.endsWith('Z')) {
    tz = '+00:00';
    normalized = normalized.slice(0, -1);
  } else {
    const tzMatch = normalized.match(/([+-]\d{2}:\d{2})$/);
    if (tzMatch) {
      tz = tzMatch[1] ?? '';
      normalized = normalized.slice(0, -tz.length);
    }
  }

  const dotIndex = normalized.lastIndexOf('.');
  if (dotIndex !== -1) {
    const fraction = normalized.slice(dotIndex + 1);
    if (/^\d+$/.test(fraction)) {
      const padded = fraction.padEnd(6, '0').slice(0, 6);
      normalized = `${normalized.slice(0, dotIndex)}.${padded}`;
    }
  }

  return `${normalized}${tz}`;
}

function stripComments(line: SourceFragment | string): string {
  const raw = typeof line === 'string' ? line : line.text;
  const hashIndex = raw.indexOf('#');
  const content = hashIndex === -1 ? raw : raw.slice(0, hashIndex);
  if (hashIndex !== -1) {
    const commentText = raw.slice(hashIndex + 1).replace(/\r?\n$/, '');
    for (let idx = 0; idx < commentText.length; idx += 1) {
      const char = commentText.charAt(idx);
      if (ILLEGAL_STR_CHARS.has(char)) {
        const fragment = typeof line === 'string' ? undefined : line.slice(hashIndex + 1 + idx);
        raiseParseError(`Invalid characters in comments: ${char}`, fragment);
      }
    }
  }
  return content.trimEnd();
}

function isWhitespace(content: string): boolean {
  return /^\s*$/.test(content);
}

function raiseParseError(message: string, fragment?: SourceFragment | null, overrides: Partial<SourceLocation> = {}): never {
  const location: SourceLocation = { ...overrides };
  if (fragment) {
    if (location.source === undefined) location.source = fragment.source;
    if (location.row === undefined) location.row = fragment.row;
    if (location.column === undefined) location.column = fragment.column;
    if (location.lineText === undefined) location.lineText = fragment.lineText ?? fragment.text.replace(/\r?\n$/, '');
  }
  throw new TycoError(message, location);
}

function fragmentFrom(target: { fragment?: SourceFragment | null; parent?: any } | null | undefined): SourceFragment | null {
  if (!target) {
    return null;
  }
  if (target.fragment) {
    return target.fragment;
  }
  if (target.parent && target.parent.fragment) {
    return target.parent.fragment;
  }
  return null;
}

function failWithFragment(target: { fragment?: SourceFragment | null; parent?: any } | null | undefined, message: string): never {
  raiseParseError(message, fragmentFrom(target));
}

// ============================================================================
// TycoLexer - Tokenizes and parses .tyco files
// ============================================================================

class TycoLexer {
  private static IRE = '((?!\\d)\\w+)';  // identifier regex
  private static ATTR_IRE = '((?!\\d)[\\w\\.]+)';
  private static GLOBAL_SCHEMA_REGEX = new RegExp(`^([?])?${TycoLexer.IRE}(\\[\\])?\\s+${TycoLexer.ATTR_IRE}\\s*:`);
  private static STRUCT_BLOCK_REGEX = new RegExp(`^${TycoLexer.IRE}:`);
  private static STRUCT_SCHEMA_REGEX = new RegExp(`^\\s+([*?])?${TycoLexer.IRE}(\\[\\])?\\s+${TycoLexer.ATTR_IRE}\\s*:`);
  private static STRUCT_DEFAULTS_REGEX = new RegExp(`^\\s+${TycoLexer.ATTR_IRE}\\s*:`);
  private static STRUCT_INSTANCE_REGEX = /^\s+-/;

  private context: TycoContext;
  private lines: SourceFragment[];
  private path: string | null;
  private defaults: Map<string, Map<string, any>>;

  constructor(context: TycoContext, lines: SourceFragment[], path: string | null = null) {
    this.context = context;
    this.lines = lines;
    this.path = path;
    this.defaults = new Map();
  }

  static fromPath(context: TycoContext, filePath: string): TycoLexer {
    if (!context.pathCache.has(filePath)) {
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        raiseParseError(`Can only load path if is a regular file: ${filePath}`, null, { source: filePath });
      }
      
      const content = fs.readFileSync(filePath, 'utf-8');
      const fragments = coerceContentToFragments(content, filePath);
      
      const lexer = new TycoLexer(context, fragments, filePath);
      lexer.process();
      context.pathCache.set(filePath, lexer);
    }
    return context.pathCache.get(filePath)!;
  }

  process(): void {
    while (this.lines.length > 0) {
      const line = this.lines.shift()!;
      
      // Handle #include directives
      const includeMatch = line.text.trimEnd().match(/^#include\s+(\S.*)$/);
      if (includeMatch) {
        let includePath = includeMatch[1];
        if (!path.isAbsolute(includePath!)) {
          const relDir = this.path ? path.dirname(this.path) : process.cwd();
          includePath = path.join(relDir, includePath!);
        }
        const lexer = TycoLexer.fromPath(this.context, includePath!);
        lexer.process();
        for (const [typeName, attrDefaults] of lexer.defaults.entries()) {
          if (this.defaults.has(typeName)) {
            raiseParseError(`This should not happen: ${typeName} in defaults`, line);
          }
          this.defaults.set(typeName, new Map(attrDefaults));
        }
        continue;
      }
      
      // Handle global schema
      const globalMatch = line.text.match(TycoLexer.GLOBAL_SCHEMA_REGEX);
      if (globalMatch) {
        this.loadGlobal(line, globalMatch);
        continue;
      }
      
      // Handle struct blocks
      const structMatch = line.text.match(TycoLexer.STRUCT_BLOCK_REGEX);
      if (structMatch) {
        const typeName = structMatch[1];
        if (!this.context.structs.has(typeName!)) {
          const struct = this.context.addStruct(typeName!);
          this.loadSchema(struct);
        }
        const struct = this.context.structs.get(typeName!)!;
        this.loadLocalDefaultsAndInstances(struct);
        continue;
      }
      
      // Blank lines or comments
      if (!stripComments(line)) {
        continue;
      }
      
      raiseParseError(`Malformatted config file: ${line.text.trimEnd()}`, line);
    }
  }

  private loadGlobal(line: SourceFragment, match: RegExpMatchArray): void {
    const options = match[1];
    const typeName = match[2];
    const arrayFlag = match[3];
    const attrName = match[4];
    const isArray = arrayFlag === '[]';
    const isNullable = options === '?';
    
    const defaultFragment = line.slice(match[0].length).trimLeadingWhitespace();
    if (!defaultFragment.text) {
      raiseParseError('Must provide a value when setting globals', defaultFragment);
    }
    
    this.lines.unshift(defaultFragment);
    const [attr, delim] = this.loadTycoAttr([EOL], '', true, attrName);
    attr.applySchemaInfo({ typeName, attrName, isNullable, isArray });
    this.context.setGlobalAttr(attrName!, attr);
  }

  private loadSchema(struct: TycoStruct): void {
    if (this.defaults.has(struct.typeName)) {
      raiseParseError(`This should not happen: ${struct.typeName} in defaults`, this.lines[0] ?? new SourceFragment('', { source: this.path ?? undefined }));
    }
    this.defaults.set(struct.typeName, new Map());
    
    while (true) {
      if (this.lines.length === 0) break;
      
      const content = stripComments(this.lines[0]!);
      if (!content) {
        this.lines.shift();
        continue;
      }
      
      const match = this.lines[0]!.text.match(TycoLexer.STRUCT_SCHEMA_REGEX);
      if (!match) {
        if (/^\s+\w+\s+\w+/.test(content)) {
          raiseParseError(`Schema attribute missing trailing colon: ${content}`, this.lines[0]);
        }
        break;
      }
      
      const line = this.lines.shift()!;
      const options = match[1];
      const typeName = match[2];
      const arrayFlag = match[3];
      const attrName = match[4];
      
      if (struct.attrTypes.has(attrName!)) {
        raiseParseError(`Duplicate attribute found for ${attrName} in ${struct.typeName}: ${line.text.trimEnd()}`, line);
      }
      
      struct.attrTypes.set(attrName!, typeName!);
      const isArray = arrayFlag === '[]';
      if (isArray) {
        struct.arrayKeys.add(attrName!);
      }
      
      if (options === '*') {
        if (isArray) {
          raiseParseError('Cannot set a primary key on an array', line);
        }
        struct.primaryKeys.push(attrName!);
      } else if (options === '?') {
        struct.nullableKeys.add(attrName!);
      }
      
      const defaultText = line.slice(match[0].length).trimLeadingWhitespace();
      const defaultContent = stripComments(defaultText);
      if (defaultContent) {
        this.lines.unshift(defaultText);
        const [attr, delim] = this.loadTycoAttr([EOL], '', true, attrName);
        this.defaults.get(struct.typeName)!.set(attrName!, attr);
      }
    }
  }

  private loadLocalDefaultsAndInstances(struct: TycoStruct): void {
    while (true) {
      if (this.lines.length === 0) break;
      if (this.lines[0]!.text.startsWith('#include ')) break;
      
      const content = stripComments(this.lines[0]!);
      if (!content) {
        this.lines.shift();
        continue;
      }
      
      if (!/^\s/.test(this.lines[0]!.text)) break;  // Start of new struct
      
      if (this.lines[0]!.text.match(TycoLexer.STRUCT_SCHEMA_REGEX)) {
        raiseParseError('Can not add schema attributes after initial construction', this.lines[0]);
      }
      
      const line = this.lines.shift()!;
      const defaultMatch = line.text.match(TycoLexer.STRUCT_DEFAULTS_REGEX);
      
      if (defaultMatch) {
        const attrName = defaultMatch[1];
        if (!struct.attrTypes.has(attrName!)) {
          raiseParseError(`Setting invalid default of ${attrName} for ${struct.typeName}`, line);
        }
        const defaultText = line.slice(defaultMatch[0].length).trimLeadingWhitespace();
        if (stripComments(defaultText)) {
          this.lines.unshift(defaultText);
          const [attr, delim] = this.loadTycoAttr([EOL], '', true, attrName);
          this.defaults.get(struct.typeName)!.set(attrName!, attr);
        } else {
          this.defaults.get(struct.typeName)!.delete(attrName!);
        }
      } else if (line.text.match(TycoLexer.STRUCT_INSTANCE_REGEX)) {
        const match = line.text.match(TycoLexer.STRUCT_INSTANCE_REGEX)!;
        this.lines.unshift(line.slice(match[0].length).trimLeadingWhitespace());
        const instArgs: any[] = [];
        
        while (true) {
          if (this.lines.length === 0) break;
          
          const instContent = stripComments(this.lines[0]!);
          if (!instContent) {
            this.lines.shift();
            break;
          }
          
          if (instContent === '\\') {  // Line continuation
            this.lines.shift();
            if (this.lines.length > 0) {
              this.lines[0]! = this.lines[0]!.trimLeadingWhitespace();
            }
            continue;
          }
          
          const [attr, delim] = this.loadTycoAttr([',', EOL], '', false);
          instArgs.push(attr);
          
          if (delim === EOL) break;
        }
        
        struct.createInstance(instArgs, this.defaults.get(struct.typeName)!);
      }
    }
  }

  private loadTycoAttr(
    goodDelim: string | string[] = [EOL],
    badDelim: string | string[] = '',
    popEmptyLines = true,
    attrName: string | null = null
  ): [any, string] {
    const goodDelimSet = new Set(Array.isArray(goodDelim) ? goodDelim : (goodDelim ? [goodDelim] : []));
    const badDelimArray = Array.isArray(badDelim) ? badDelim : (badDelim ? badDelim.split('') : []);
    const badDelimSet = new Set([
      ...badDelimArray,
      '(', ')', '[', ']', ','
    ]);
    for (const d of goodDelimSet) badDelimSet.delete(d);
    
    return this.loadTycoAttrWithSets(goodDelimSet, badDelimSet, popEmptyLines, attrName);
  }

  private loadTycoAttrWithSets(
    goodDelimSet: Set<string>,
    badDelimSet: Set<string>,
    popEmptyLines: boolean,
    attrName: string | null
  ): [any, string] {
    if (this.lines.length === 0) {
      raiseParseError('Syntax error: no content found', null, { source: this.path ?? undefined });
    }
    
    const currentLine = this.lines[0]!;
    
    // Check for field name with colon
    const colonMatch = currentLine.text.match(new RegExp(`^${TycoLexer.ATTR_IRE}\\s*:\\s*`));
    if (colonMatch) {
      if (attrName !== null) {
        raiseParseError(`Colon : found in content - enclose in quotes: ${colonMatch[1]}`, currentLine.slice(colonMatch.index ?? 0));
      }
      attrName = colonMatch[1]!;
      this.lines[0]! = currentLine.slice(colonMatch[0].length);
      // Pass the computed sets, not recomputing them
      return this.loadTycoAttrWithSets(goodDelimSet, badDelimSet, popEmptyLines, attrName);
    }
    
    const ch = this.lines[0]!.text[0];
    let attr: any;
    let delim: string;
    
    if (ch === '[') {  // Inline array
      const arrayFragment = this.lines[0]!;
      this.lines[0]! = this.lines[0]!.slice(1);
      const content = this.loadArray(']');
      attr = new TycoArray(this.context, content);
      attr.fragment = arrayFragment;
      delim = this.stripNextDelim(goodDelimSet);
    } else if (/\w/.test(ch!)) {  // Possible inline instance/reference
      const instMatch = this.lines[0]!.text.match(/^(\w+)\(/);
      if (instMatch) {
        const typeName = instMatch[1];
        const invocationFragment = this.lines[0]!;
        this.lines[0]! = this.lines[0]!.slice(instMatch[0].length);
        const instArgs = this.loadArray(')');
        
        if (!this.context.structs.has(typeName!) || this.context.structs.get(typeName!)!.primaryKeys.length > 0) {
          attr = new TycoReference(this.context, instArgs, typeName!);
          attr.fragment = invocationFragment;
        } else {
          const defaultKwargs = this.defaults.get(typeName!) || new Map();
          attr = this.context.structs.get(typeName!)!.createInlineInstance(instArgs, defaultKwargs);
          attr.fragment = invocationFragment;
        }
        delim = this.stripNextDelim(goodDelimSet);
      } else {
        [attr, delim] = this.stripNextAttrAndDelim(goodDelimSet, badDelimSet);
      }
    } else if (ch === '"' || ch === "'") {  // Quoted string
      const triple = ch.repeat(3);
      if (this.lines[0]!.text.startsWith(triple)) {
        const quotedString = this.loadTripleString(triple);
        attr = new TycoValue(this.context, quotedString.text);
        attr.fragment = quotedString.fragment;
      } else {
        const quotedString = this.loadSingleString(ch);
        attr = new TycoValue(this.context, quotedString.text);
        attr.fragment = quotedString.fragment;
      }
      delim = this.stripNextDelim(goodDelimSet);
    } else {
      [attr, delim] = this.stripNextAttrAndDelim(goodDelimSet, badDelimSet);
    }
    
    const remainingLine = this.lines[0];
    if (remainingLine) {
      this.lines[0]! = remainingLine.trimLeadingSpacesAndTabs();
      if (popEmptyLines && !this.lines[0]!.text) {
        this.lines.shift();
      }
    } else if (popEmptyLines) {
      this.lines.shift();
    }
    
    attr.applySchemaInfo({ attrName });
    return [attr, delim];
  }

  private stripNextDelim(goodDelim: Set<string>): string {
    const delimRegex = new RegExp(`^(${[...goodDelim].map(d => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`);
    const currentLine = this.lines[0];
    if (!currentLine) {
      raiseParseError(`Should have found next delimiter ${[...goodDelim]}`, null, { source: this.path ?? undefined });
    }
    const match = currentLine.text.match(delimRegex);
    
    if (!match) {
      if (goodDelim.has(EOL) && !stripComments(currentLine)) {
        this.lines[0]! = currentLine.slice(currentLine.text.length);
        return EOL;
      }
      raiseParseError(`Should have found next delimiter ${[...goodDelim]}: ${currentLine.text.trimEnd()}`, currentLine);
    }
    
    const delim = match[1]!;
    this.lines[0]! = currentLine.slice(match[0].length);
    return delim;
  }

  private stripNextAttrAndDelim(goodDelim: Set<string>, badDelim: Set<string>): [TycoValue, string] {
    const currentLine = this.lines[0];
    if (!currentLine) {
      raiseParseError('Unexpected end of content', null, { source: this.path ?? undefined });
    }
    const allContent = stripComments(currentLine) + EOL;
    const allDelim = [...goodDelim, ...badDelim];
    const delimRegex = new RegExp(allDelim.map(d => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));
    const match = allContent.match(delimRegex);
    
    if (!match || match.index === undefined) {
      raiseParseError(`Should have found some delimiter ${allDelim}: ${currentLine.text.trimEnd()}`, currentLine);
    }
    
    const delim = match[0];
    if (badDelim.has(delim)) {
      raiseParseError(`Bad delim: ${delim}`, currentLine.slice(match.index));
    }
    
    const text = allContent.substring(0, match.index);
    const attr = new TycoValue(this.context, text);
    const fragmentLength = Math.min(match.index, currentLine.text.length);
    attr.fragment = currentLine.slice(0, fragmentLength);
    this.lines[0]! = currentLine.slice(match.index + delim.length);
    return [attr, delim];
  }

  private loadArray(closingChar: string): any[] {
    const goodDelims = [closingChar, ','];
    const badDelims = closingChar === ']' ? [')'] : [']'];
    const array: any[] = [];
    
    while (true) {
      if (this.lines.length === 0) {
        raiseParseError(`Could not find ${closingChar}`, null, { source: this.path ?? undefined });
      }
      
      if (!stripComments(this.lines[0]!)) {
        this.lines.shift();
        continue;
      }
      
      if (this.lines[0]!.text.startsWith(closingChar)) {
        this.lines[0]! = this.lines[0]!.slice(1);
        break;
      }
      
      const [attr, delim] = this.loadTycoAttr(goodDelims, badDelims);
      array.push(attr);
      
      if (delim === closingChar) break;
    }
    
    return array;
  }

  private loadTripleString(triple: string): { text: string; fragment: SourceFragment | null } {
    const isLiteral = triple === "'''";
    let start = 3;
    const allContents: string[] = [];
    const fragment = this.lines[0] ?? null;
    
    while (true) {
      if (this.lines.length === 0) {
        raiseParseError('Unclosed triple quote', fragment ?? null, { source: this.path ?? undefined });
      }
      
      const line = this.lines.shift()!;
      const end = line.text.indexOf(triple, start);
      
      if (end !== -1) {
        const endIdx = end + 3;
        const contentFragment = line.slice(0, endIdx);
        let remainder = line.slice(endIdx);
        allContents.push(contentFragment.text);
        
        // Edge case: there can be a max of 2 additional quotes
        for (let i = 0; i < 2; i++) {
          if (remainder.text.startsWith(triple![0]!)) {
            allContents[allContents.length - 1]! += triple![0]!;
            remainder = remainder.slice(1);
          } else {
            break;
          }
        }
        
        this.lines.unshift(remainder);
        break;
      } else {
        if (!isLiteral && line.text.endsWith('\\' + EOL)) {
          const trimmedLine = line.text.substring(0, line.text.length - (1 + EOL.length));
          allContents.push(trimmedLine);
          while (this.lines.length > 0) {
            this.lines[0]! = this.lines[0]!.trimLeadingWhitespace();
            if (!this.lines[0]!.text) {
              this.lines.shift();
            } else {
              break;
            }
          }
        } else {
          allContents.push(line.text);
        }
      }
      
      start = 0;
    }
    
    const finalContent = allContents.join('');
    for (const char of finalContent) {
      if (ILLEGAL_STR_CHARS_MULTILINE.has(char)) {
        raiseParseError(`Invalid characters found in literal multiline string: ${char}`, null, { source: this.path ?? undefined });
      }
    }
    
    return { text: finalContent, fragment };
  }

  private loadSingleString(ch: string): { text: string; fragment: SourceFragment | null } {
    const isLiteral = ch === "'";
    let start = 1;
    const line = this.lines.shift()!;
    const fragment = line;
    
    while (true) {
      const end = line.text.indexOf(ch, start);
      if (end === -1) {
        raiseParseError(`Unclosed single-line string for ${ch}: ${line.text.trimEnd()}`, line);
      }
      
      if (isLiteral || line.text[end - 1] !== '\\') {
        const finalContent = line.text.substring(0, end + 1);
        const remainder = line.slice(end + 1);
        
        for (const char of finalContent) {
          if (ILLEGAL_STR_CHARS.has(char)) {
            raiseParseError(`Invalid characters found in literal string: ${char}`, line.slice(end));
          }
        }
        
        this.lines.unshift(remainder);
        return { text: finalContent, fragment };
      }
      
      start = end + 1;
    }
  }
}

// ============================================================================
// TycoContext - Manages parsing state and rendering pipeline
// ============================================================================

class TycoContext {
  pathCache: Map<string, TycoLexer> = new Map();
  structs: Map<string, TycoStruct> = new Map();
  globals: Map<string, any> = new Map();

  setGlobalAttr(attrName: string, attr: any): void {
    if (this.globals.has(attrName!)) {
      raiseParseError(`Duplicate global attribute: ${attrName}`, fragmentFrom(attr));
    }
    this.globals.set(attrName!, attr);
  }

  addStruct(typeName: string): TycoStruct {
    const struct = new TycoStruct(this, typeName);
    this.structs.set(typeName, struct);
    return struct;
  }

  renderContent(): void {
    this.setParents();
    this.renderBaseContent();
    this.loadPrimaryKeys();
    this.renderReferences();
    this.renderTemplates();
  }

  private setParents(): void {
    for (const [attrName, attr] of this.globals.entries()) {
      attr.setParent(this.globals);
    }
    for (const struct of this.structs.values()) {
      for (const inst of struct.instances) {
        inst.setParent();
      }
    }
  }

  private renderBaseContent(): void {
    for (const attr of this.globals.values()) {
      attr.renderBaseContent();
    }
    for (const struct of this.structs.values()) {
      for (const inst of struct.instances) {
        inst.renderBaseContent();
      }
    }
  }

  private loadPrimaryKeys(): void {
    for (const struct of this.structs.values()) {
      struct.loadPrimaryKeys();
    }
  }

  private renderReferences(): void {
    for (const attr of this.globals.values()) {
      attr.renderReferences();
    }
    for (const struct of this.structs.values()) {
      for (const inst of struct.instances) {
        inst.renderReferences();
      }
    }
  }

  private renderTemplates(): void {
    for (const attr of this.globals.values()) {
      attr.renderTemplates();
    }
    for (const struct of this.structs.values()) {
      for (const inst of struct.instances) {
        inst.renderTemplates();
      }
    }
  }

  toJSON(): any {
    const jsonContent: any = {};
    
    for (const [attrName, attr] of this.globals.entries()) {
      jsonContent[attrName] = attr.toJSON();
    }
    
    for (const [typeName, struct] of this.structs.entries()) {
      if (struct.primaryKeys.length === 0) continue;  // Don't serialize inline instances
      
      jsonContent[typeName] = [];
      for (const instance of struct.instances) {
        jsonContent[typeName].push(instance.toJSON());
      }
    }
    
    return jsonContent;
  }

  toObject(): any {
    const result: Record<string, any> = {};

    for (const [name, attr] of this.globals.entries()) {
      result[name] = attr.toJSON();
    }

    for (const [typeName, struct] of this.structs.entries()) {
      if (struct.primaryKeys.length === 0) {
        continue;
      }
      result[typeName] = struct.instances.map(instance => {
        const entry: Record<string, any> = {};
        for (const [fieldName, value] of instance.instKwargs.entries()) {
          entry[fieldName] = value.toJSON();
        }
        return entry;
      });
    }

    return result;
  }
}

// ============================================================================
// TycoStruct - Type definitions with schema
// ============================================================================

class TycoStruct {
  context: TycoContext;
  typeName: string;
  attrTypes: Map<string, string> = new Map();
  primaryKeys: string[] = [];
  nullableKeys: Set<string> = new Set();
  arrayKeys: Set<string> = new Set();
  instances: TycoInstance[] = [];
  mappedInstances: Map<string, TycoInstance> = new Map();

  constructor(context: TycoContext, typeName: string) {
    this.context = context;
    this.typeName = typeName;
  }

  get attrNames(): string[] {
    return [...this.attrTypes.keys()];
  }

  createInstance(instArgs: any[], defaultKwargs: Map<string, any>): void {
    const inst = this.createInlineInstance(instArgs, defaultKwargs);
    this.instances.push(inst);
  }

  createInlineInstance(instArgs: any[], defaultKwargs: Map<string, any>): TycoInstance {
    const instKwargs = new Map<string, any>();
    let kwargsOnly = false;
    
    for (let i = 0; i < instArgs.length; i++) {
      const attr = instArgs[i];
      if (!attr.attrName) {
        if (kwargsOnly) {
          failWithFragment(attr, `Can not use positional values after keyed values: ${instArgs}`);
        }
        attr.attrName = this.attrNames[i];
      } else {
        kwargsOnly = true;
      }
      instKwargs.set(attr.attrName, attr);
    }
    
    const completeKwargs = this.resolveCompleteKwargs(instKwargs, defaultKwargs);
    return new TycoInstance(this.context, this.typeName, completeKwargs);
  }

  loadPrimaryKeys(): void {
    if (this.primaryKeys.length === 0) return;
    
    for (const inst of this.instances) {
      const key = this.primaryKeys.map(k => inst.instKwargs.get(k)!.rendered).join('\0');
      if (this.mappedInstances.has(key)) {
        failWithFragment(inst, `${key} already found for ${this.typeName}: ${this.mappedInstances.get(key)}`);
      }
      this.mappedInstances.set(key, inst);
    }
  }

  loadReference(instArgs: any[]): TycoInstance {
    const instKwargs = new Map<string, any>();
    let kwargsOnly = false;
    
    for (let i = 0; i < instArgs.length; i++) {
      const attr = instArgs[i];
      let attrName: string;
      
      if (!attr.attrName) {
        if (kwargsOnly) {
          failWithFragment(attr, `Can not use positional values after keyed values: ${instArgs}`);
        }
        attrName = this.primaryKeys[i]!;
      } else {
        attrName = attr.attrName;
        kwargsOnly = true;
      }
      
      const typeName = this.attrTypes.get(attrName)!;
      const isNullable = this.nullableKeys.has(attrName);
      const isArray = this.arrayKeys.has(attrName);
      
      attr.applySchemaInfo({ typeName, attrName, isNullable, isArray });
      attr.renderBaseContent();
      instKwargs.set(attrName!, attr);
    }
    
    const key = this.primaryKeys.map(attrName => instKwargs.get(attrName).rendered).join('\0');
    if (!this.mappedInstances.has(key)) {
      const fragment = fragmentFrom(instArgs[0] ?? null);
      raiseParseError(`Unable to find reference of ${this.typeName}(${key})`, fragment);
    }
    
    return this.mappedInstances.get(key)!;
  }

  private resolveCompleteKwargs(instKwargs: Map<string, any>, defaultKwargs: Map<string, any>): Map<string, any> {
    const completeKwargs = new Map<string, any>();
    
    for (const attrName of this.attrTypes.keys()) {
      if (instKwargs.has(attrName!)) {
        completeKwargs.set(attrName!, instKwargs.get(attrName));
      } else if (defaultKwargs.has(attrName!)) {
        const val = defaultKwargs.get(attrName);
        if (Array.isArray(val)) {
          completeKwargs.set(attrName!, val.map((v: any) => v.makeCopy()));
        } else {
          completeKwargs.set(attrName!, val.makeCopy());
        }
      } else {
        const fallbackFragment = fragmentFrom(instKwargs.values().next().value ?? null);
        raiseParseError(`Invalid attribute ${attrName} for ${this.typeName}`, fallbackFragment);
      }
      
      const attr = completeKwargs.get(attrName);
      const typeName = this.attrTypes.get(attrName)!;
      const isNullable = this.nullableKeys.has(attrName);
      const isArray = this.arrayKeys.has(attrName);
      
      attr.applySchemaInfo({ typeName, attrName, isNullable, isArray });
    }
    
    return completeKwargs;
  }
}

// ============================================================================
// TycoInstance - Instantiated objects
// ============================================================================

class TycoInstance {
  context: TycoContext;
  typeName: string;
  instKwargs: Map<string, any>;
  attrName: string | null = null;
  isNullable: boolean | null = null;
  isArray: boolean | null = null;
  parent: any = null;
  fragment: SourceFragment | null = null;

  constructor(context: TycoContext, typeName: string, instKwargs: Map<string, any>) {
    this.context = context;
    this.typeName = typeName;
    this.instKwargs = instKwargs;
  }

  makeCopy(): TycoInstance {
    const instKwargs = new Map<string, any>();
    for (const [a, i] of this.instKwargs.entries()) {
      instKwargs.set(a, i.makeCopy());
    }
    const copy = new TycoInstance(this.context, this.typeName, instKwargs);
    copy.fragment = this.fragment;
    return copy;
  }

  applySchemaInfo(kwargs: any): void {
    for (const [attr, val] of Object.entries(kwargs)) {
      if (attr === 'typeName' && this.typeName !== val) {
        failWithFragment(this, `Expected ${this.typeName} for ${this.parent}.${this.attrName} and instead have ${this}`);
      }
      (this as any)[attr] = val;
    }
    if (this.isArray === true) {
      failWithFragment(this, `Expected array for ${this.parent}.${this.attrName}, instead have ${this}`);
    }
  }

  setParent(parent: any = null): void {
    this.parent = parent;
    for (const i of this.instKwargs.values()) {
      i.setParent(this);
    }
  }

  renderBaseContent(): void {
    for (const i of this.instKwargs.values()) {
      i.renderBaseContent();
    }
  }

  renderReferences(): void {
    for (const i of this.instKwargs.values()) {
      i.renderReferences();
    }
  }

  renderTemplates(): void {
    for (const i of this.instKwargs.values()) {
      i.renderTemplates();
    }
  }

  get rendered(): any {
    const result: any = {};
    for (const [a, i] of this.instKwargs.entries()) {
      result[a] = i.rendered;
    }
    return result;
  }

  toJSON(): any {
    const result: any = {};
    for (const [a, i] of this.instKwargs.entries()) {
      result[a] = i.toJSON();
    }
    return result;
  }
}

// Proxy to access attributes
const instanceHandler = {
  get(target: TycoInstance, prop: string) {
    if (prop in target) {
      return (target as any)[prop];
    }
    return target.instKwargs.get(prop);
  }
};

// ============================================================================
// TycoReference - Lazy container for instance references
// ============================================================================

const UNRENDERED = Symbol('unrendered');

class TycoReference {
  context: TycoContext;
  instArgs: any[];
  typeName: string;
  attrName: string | null = null;
  isNullable: boolean | null = null;
  isArray: boolean | null = null;
  parent: any = null;
  rendered: any = UNRENDERED;
  fragment: SourceFragment | null = null;

  constructor(context: TycoContext, instArgs: any[], typeName: string) {
    this.context = context;
    this.instArgs = instArgs;
    this.typeName = typeName;
  }

  makeCopy(): TycoReference {
    const instArgs = this.instArgs.map(i => i.makeCopy());
    const copy = new TycoReference(this.context, instArgs, this.typeName);
    copy.fragment = this.fragment;
    return copy;
  }

  applySchemaInfo(kwargs: any): void {
    for (const [attr, val] of Object.entries(kwargs)) {
      if (attr === 'typeName' && this.typeName !== val) {
        failWithFragment(this, `Expected ${this.typeName} for ${this.parent}.${this.attrName} and instead have ${this}`);
      }
      (this as any)[attr] = val;
    }
    if (this.isArray === true) {
      failWithFragment(this, `Expected array for ${this.parent}.${this.attrName}, instead have ${this}`);
    }
  }

  setParent(parent: any): void {
    this.parent = parent;
  }

  renderBaseContent(): void {
    // No-op
  }

  renderReferences(): void {
    if (this.rendered !== UNRENDERED) {
      failWithFragment(this, `Rendered multiple times ${this}`);
    }
    if (!this.context.structs.has(this.typeName)) {
      failWithFragment(this, `Bad type name for reference: ${this.typeName} ${this.instArgs}`);
    }
    const struct = this.context.structs.get(this.typeName)!;
    this.rendered = struct.loadReference(this.instArgs);
  }

  renderTemplates(): void {
    // No-op
  }

  toJSON(): any {
    return this.rendered.toJSON();
  }
}

// Proxy to access referenced instance attributes
const referenceHandler = {
  get(target: TycoReference, prop: string) {
    if (prop in target) {
      return (target as any)[prop];
    }
    if (target.rendered === UNRENDERED) {
      failWithFragment(target, 'Reference not yet rendered');
    }
    return target.rendered.instKwargs.get(prop);
  }
};

// ============================================================================
// TycoArray - Collections with type consistency
// ============================================================================

class TycoArray {
  context: TycoContext;
  content: any[];
  typeName: string | null = null;
  attrName: string | null = null;
  isNullable: boolean | null = null;
  isArray: boolean | null = null;
  parent: any = null;
  fragment: SourceFragment | null = null;

  constructor(context: TycoContext, content: any[]) {
    this.context = context;
    this.content = content;
  }

  applySchemaInfo(kwargs: any): void {
    for (const [attr, val] of Object.entries(kwargs)) {
      (this as any)[attr] = val;
    }
    
    for (const i of this.content) {
      const itemKwargs: any = { isNullable: false, isArray: false };
      if (this.typeName !== null) {
        itemKwargs.typeName = this.typeName;
      }
      if (this.attrName !== null) {
        itemKwargs.attrName = this.attrName;
      }
      i.applySchemaInfo(itemKwargs);
    }
    
    if (this.isArray === false) {
      failWithFragment(this, `Schema for ${this.parent}.${this.attrName} needs to indicate array with []`);
    }
  }

  setParent(parent: any): void {
    this.parent = parent;
    for (const i of this.content) {
      i.setParent(parent);  // We ignore the TycoArray object itself for templating
    }
  }

  renderBaseContent(): void {
    for (const i of this.content) {
      i.renderBaseContent();
    }
  }

  renderReferences(): void {
    for (const i of this.content) {
      i.renderReferences();
    }
  }

  renderTemplates(): void {
    for (const i of this.content) {
      i.renderTemplates();
    }
  }

  makeCopy(): TycoArray {
    const copy = new TycoArray(this.context, this.content.map(i => i.makeCopy()));
    copy.fragment = this.fragment;
    return copy;
  }

  get rendered(): any[] {
    return this.content.map(i => i.rendered);
  }

  toJSON(): any[] {
    return this.content.map(i => i.toJSON());
  }
}

// ============================================================================
// TycoValue - Primitive values with template expansion
// ============================================================================

class TycoValue {
  private static TEMPLATE_REGEX = /\{([\w\.]+)\}/g;
  private static BASE_TYPES = new Set(['str', 'int', 'bool', 'float', 'decimal', 'date', 'time', 'datetime']);
  
  context: TycoContext;
  content: string;
  typeName: string | null = null;
  attrName: string | null = null;
  isNullable: boolean | null = null;
  isArray: boolean | null = null;
  parent: any = null;
  isLiteralStr = false;
  rendered: any = UNRENDERED;
  fragment: SourceFragment | null = null;

  constructor(context: TycoContext, content: string) {
    this.context = context;
    this.content = content;
  }

  makeCopy(): TycoValue {
    const attr = new TycoValue(this.context, this.content);
    attr.typeName = this.typeName;
    attr.attrName = this.attrName;
    attr.isNullable = this.isNullable;
    attr.isArray = this.isArray;
    attr.fragment = this.fragment;
    return attr;
  }

  applySchemaInfo(kwargs: any): void {
    for (const [attr, val] of Object.entries(kwargs)) {
      (this as any)[attr] = val;
    }
    
    if (this.isArray === true && !(this.isNullable === true && this.content === 'null')) {
      failWithFragment(this, `Array expected for ${this.parent}.${this.attrName}: ${this}`);
    }
    
    if (this.typeName !== null && !TycoValue.BASE_TYPES.has(this.typeName)) {
      failWithFragment(this, `${this.typeName} expected for ${this.content}, likely needs ${this.typeName}(${this.content})`);
    }
  }

  setParent(parent: any): void {
    this.parent = parent;
  }

  renderBaseContent(): void {
    if (this.typeName === null || this.attrName === null || this.isNullable === null || this.isArray === null) {
      failWithFragment(this, `Attributes not set ${this.attrName}: ${this}`);
    }
    
    let content = this.content;
    let rendered: any;
    
    if (this.isNullable && content === 'null') {
      rendered = null;
    } else if (this.typeName === 'str') {
      this.isLiteralStr = content.startsWith("'");
      
      if (content.startsWith("'''") || content.startsWith('"""')) {
        content = content.substring(3, content.length - 3);
        if (content.startsWith(EOL)) {
          content = content.substring(EOL.length);
        }
      } else if (content.startsWith("'") || content.startsWith('"')) {
        content = content.substring(1, content.length - 1);
      }
      
      rendered = content;
    } else if (this.typeName === 'int') {
      let base = 10;
      let digits = content;
      let sign = 1;

      if (digits.startsWith('-') || digits.startsWith('+')) {
        sign = digits.startsWith('-') ? -1 : 1;
        digits = digits.substring(1);
      }

      if (/^0[xX]/.test(digits)) {
        base = 16;
        digits = digits.substring(2);
      } else if (/^0[oO]/.test(digits)) {
        base = 8;
        digits = digits.substring(2);
      } else if (/^0[bB]/.test(digits)) {
        base = 2;
        digits = digits.substring(2);
      }

      rendered = sign * parseInt(digits, base);
    } else if (this.typeName === 'float') {
      rendered = parseFloat(content);
    } else if (this.typeName === 'decimal') {
      rendered = parseFloat(content);  // JavaScript doesn't have built-in Decimal
      } else if (this.typeName === 'bool') {
        if (content === 'true') {
          rendered = true;
        } else if (content === 'false') {
          rendered = false;
        } else {
          failWithFragment(this, `Boolean ${this.attrName} for ${this.parent} not in (true, false): ${content}`);
        }
    } else if (this.typeName === 'date') {
      rendered = content;  // Store as string for JSON compatibility
    } else if (this.typeName === 'time') {
      rendered = normalizeTimeLiteral(content);
    } else if (this.typeName === 'datetime') {
      rendered = normalizeDateTimeLiteral(content);
    } else {
      failWithFragment(this, `Unknown type of ${this.typeName}`);
    }
    
    this.rendered = rendered;
  }

  renderReferences(): void {
    // No-op
  }

  renderTemplates(): void {
    if (this.typeName !== 'str' || this.isLiteralStr) {
      return;
    }
    
    if (this.isNullable && this.rendered === null) {
      return;
    }
    
    const templateRender = (match: string, templateVar: string): string => {
      const tryGetAttr = (target: any, attr: string): any | undefined => {
        if (target instanceof Map) {
          return target.has(attr) ? target.get(attr) : undefined;
        }
        if (target instanceof TycoReference) {
          if (target.rendered === UNRENDERED) {
            failWithFragment(target, `Reference ${target.typeName} not resolved for template access`);
          }
          return target.rendered.instKwargs.get(attr);
        }
        if (target && target.instKwargs instanceof Map) {
          return target.instKwargs.get(attr);
        }
        return undefined;
      };

      let obj: any = this.parent;
      let varPath = templateVar;
      
      // Handle parent traversal (..)
      if (varPath.startsWith('..')) {
        varPath = varPath.substring(1);  // Remove one dot
        while (varPath.startsWith('.')) {
          obj = obj.parent;
          if (obj === null) {
            failWithFragment(this, 'Traversing parents hit base instance');
          }
          varPath = varPath.substring(1);
        }
      }
      
      // Traverse the path
      const parts = varPath ? varPath.split('.') : [];
      if (parts.length === 0) {
        failWithFragment(this, 'Empty template content');
      }
      const firstSegment = parts.length > 0 ? parts[0]! : '';
      const queue: string[] = [...parts];
      while (queue.length > 0) {
        const attr = queue[0]!;
        const value = tryGetAttr(obj, attr);
        if (value !== undefined) {
          obj = value;
          queue.shift();
          continue;
        }
        if (queue.length > 1) {
          const first = queue.shift()!;
          const second = queue.shift()!;
          const merged = `${first}.${second}`;
          queue.unshift(merged);
          continue;
        }
        if (attr === 'global' && firstSegment === 'global') {
          obj = this.context.globals;
          queue.shift();
          continue;
        }
        failWithFragment(this, `Cannot access ${attr}`);
      }
      
      if (obj.typeName && !['str', 'int'].includes(obj.typeName)) {
        failWithFragment(this, `Can not templatize objects other than strings or ints: ${obj} (${this})`);
      }
      
      return String(obj.rendered);
    };
    
    let rendered = this.rendered.replace(TycoValue.TEMPLATE_REGEX, templateRender);
    rendered = subEscapeSequences(rendered);
    this.rendered = rendered;
  }

  toJSON(): any {
    return this.rendered;
  }
}

// ============================================================================
// Public API
// ============================================================================

export class TycoParser {
  private context: TycoContext | null = null;
  private readonly options: TycoParserOptions;

  constructor(options: TycoParserOptions = {}) {
    this.options = options;
  }

  public static parse(content: string, options?: TycoParserOptions): any {
    const parser = new TycoParser(options);
    return parser.parseContent(content);
  }

  public static parseFile(filePath: string, options?: TycoParserOptions): any {
    const parser = new TycoParser(options);
    return parser.parseFile(filePath);
  }

  public parseContent(content: string): any {
    const context = new TycoContext();
    const fragments = coerceContentToFragments(content);
    const lexer = new TycoLexer(context, fragments);
    lexer.process();
    context.renderContent();
    this.context = context;
    return context.toObject();
  }

  public parseFile(filePath: string): any {
    const context = new TycoContext();
    const lexer = TycoLexer.fromPath(context, filePath);
    lexer.process();
    context.renderContent();
    this.context = context;
    return context.toObject();
  }

  public getContext(): TycoContext {
    if (!this.context) {
      throw new TycoError('Parser context not initialized. Call parseContent or parseFile first.');
    }
    return this.context;
  }
}

export function load(filePath: string, options?: TycoParserOptions): any {
  return TycoParser.parseFile(filePath, options);
}

export function loads(content: string, options?: TycoParserOptions): any {
  return TycoParser.parse(content, options);
}

export { TycoContext, TycoLexer, TycoStruct, TycoInstance, TycoValue, TycoArray, TycoReference };
