import { SourceLocation } from './errors';

export interface SourceFragmentInit extends SourceLocation {
  column?: number | undefined;
  lineText?: string | undefined;
}

export class SourceFragment {
  readonly text: string;
  readonly row: number;
  readonly column: number;
  readonly source?: string | undefined;
  readonly lineText?: string | undefined;

  constructor(text: string, init: SourceFragmentInit = {}) {
    this.text = text;
    this.row = init.row ?? 1;
    this.column = init.column ?? 1;
    this.source = init.source;
    this.lineText = init.lineText ?? text.replace(/\r?\n$/, '');
  }

  toString(): string {
    return this.text;
  }

  slice(start = 0, end?: number): SourceFragment {
    const actualStart = clamp(start, 0, this.text.length);
    const actualEnd = clamp(end ?? this.text.length, actualStart, this.text.length);
    const newText = this.text.slice(actualStart, actualEnd);
    const { row, column } = this.advance(actualStart);
    return new SourceFragment(newText, {
      row,
      column,
      source: this.source,
      lineText: this.lineText,
    });
  }

  trimLeadingWhitespace(): SourceFragment {
    const match = this.text.match(/^\s+/);
    if (!match) {
      return this;
    }
    return this.slice(match[0].length);
  }

  trimLeadingSpacesAndTabs(): SourceFragment {
    const match = this.text.match(/^[ \t]+/);
    if (!match) {
      return this;
    }
    return this.slice(match[0].length);
  }

  advance(offset: number): { row: number; column: number } {
    let row = this.row;
    let column = this.column;
    const length = Math.min(Math.max(offset, 0), this.text.length);
    for (let i = 0; i < length; i += 1) {
      const ch = this.text[i];
      if (ch === '\n') {
        row += 1;
        column = 1;
      } else if (ch === '\r') {
        column = 1;
      } else {
        column += 1;
      }
    }
    return { row, column };
  }

  withText(text: string): SourceFragment {
    return new SourceFragment(text, {
      row: this.row,
      column: this.column,
      source: this.source,
      lineText: this.lineText,
    });
  }
}

export function coerceContentToFragments(content: string, source?: string): SourceFragment[] {
  if (!content) {
    return [];
  }
  const normalized = content.replace(/\r\n/g, '\n');
  const fragments: SourceFragment[] = [];
  let row = 1;
  let start = 0;

  for (let i = 0; i < normalized.length; i += 1) {
    if (normalized[i] === '\n') {
      const lineText = normalized.slice(start, i);
      const line = normalized.slice(start, i + 1);
      fragments.push(new SourceFragment(line, { row, column: 1, source, lineText }));
      row += 1;
      start = i + 1;
    }
  }

  if (start < normalized.length) {
    const lineText = normalized.slice(start);
    const line = normalized.slice(start);
    fragments.push(new SourceFragment(line, { row, column: 1, source, lineText }));
  }

  return fragments;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}
