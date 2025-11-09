export interface SourceLocation {
  source?: string | undefined;
  row?: number | undefined;
  column?: number | undefined;
  lineText?: string | undefined;
}

export class TycoError extends Error {
  source?: string | undefined;
  row?: number | undefined;
  column?: number | undefined;
  lineText?: string | undefined;

  constructor(message: string, location: SourceLocation = {}) {
    const formatted = formatTycoErrorMessage(message, location);
    super(formatted);
    this.name = 'TycoError';
    this.source = location.source;
    this.row = location.row;
    this.column = location.column;
    this.lineText = location.lineText;
  }
}

function formatTycoErrorMessage(message: string, location: SourceLocation): string {
  const parts: string[] = [];
  if (location.source) {
    parts.push(location.source);
  }
  if (typeof location.row === 'number') {
    if (typeof location.column === 'number') {
      parts.push(`${location.row}:${location.column}`);
    } else {
      parts.push(`${location.row}`);
    }
  }
  const locationPrefix = parts.length > 0 ? `${parts.join(':')} - ` : '';
  const lineText = location.lineText ? location.lineText.replace(/\r?\n$/, '') : undefined;
  const decorated = `${locationPrefix}${message}`;
  if (lineText) {
    return `${decorated}\n    ${lineText}`;
  }
  return decorated;
}

export function createTycoError(message: string, location?: SourceLocation): TycoError {
  return new TycoError(message, location ?? {});
}
