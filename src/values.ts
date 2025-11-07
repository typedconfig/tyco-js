/**
 * Tyco Value classes - Represent parsed values, arrays, references, and instances
 */

import { TycoBaseType, TycoValueType } from './types';
import { TycoContext } from './context';

export class TycoValue {
  protected context: TycoContext;
  protected value: TycoValueType;
  protected type: TycoBaseType;
  protected isArray: boolean;
  protected isNullable: boolean;
  protected hasTemplate = false;

  constructor(
    context: TycoContext,
    value: TycoValueType,
    type: TycoBaseType,
    isArray = false,
    isNullable = false
  ) {
    this.context = context;
    this.value = value;
    this.type = type;
    this.isArray = isArray;
    this.isNullable = isNullable;
    this.hasTemplate = typeof value === 'string' && value.includes('{');
  }

  public getValue(): TycoValueType {
    return this.value;
  }

  public getType(): TycoBaseType {
    return this.type;
  }

  public isArrayType(): boolean {
    return this.isArray;
  }

  public canBeNull(): boolean {
    return this.isNullable;
  }

  public hasTemplateVariable(): boolean {
    return this.hasTemplate;
  }

  public renderTemplate(parent: any): TycoValueType {
    if (!this.hasTemplate || typeof this.value !== 'string') {
      return this.value;
    }

    // Template rendering implementation
    const templateRegex = /\{([\w\.]+)\}/g;
    let rendered = this.value;

    rendered = rendered.replace(templateRegex, (match, varPath) => {
      try {
        return this.resolveTemplateVariable(varPath, parent);
      } catch (error) {
        // Return unresolved template if variable not found
        return match;
      }
    });

    return rendered;
  }

  private resolveTemplateVariable(varPath: string, parent: any): string {
    const parts = varPath.split('.');
    let current = parent;

    // Handle global scope
    if (parts[0] === 'global') {
      parts.shift();
      current = this.context;
    }

    // Handle parent traversal
    while (parts[0] === '..') {
      parts.shift();
      current = current.parent || current;
      if (!current) {
        throw new Error('Cannot traverse to parent');
      }
    }

    // Traverse the path
    for (const part of parts) {
      if (current && typeof current === 'object') {
        if (current.getGlobal && typeof current.getGlobal === 'function') {
          // TycoContext
          const global = current.getGlobal(part);
          current = global ? global.value : undefined;
        } else if (current.fields && current.fields.has) {
          // TycoStructInstance
          current = current.fields.get(part);
        } else {
          current = current[part];
        }
      } else {
        throw new Error(`Cannot access property ${part}`);
      }
    }

    if (current === undefined || current === null) {
      throw new Error(`Template variable not found: ${varPath}`);
    }

    return String(current);
  }

  public clone(): TycoValue {
    return new TycoValue(this.context, this.value, this.type, this.isArray, this.isNullable);
  }
}

export class TycoArray {
  protected context: TycoContext;
  private elements: TycoValue[];
  protected type: TycoBaseType;
  protected isNullable: boolean;

  constructor(
    context: TycoContext,
    elements: TycoValue[],
    elementType: TycoBaseType,
    isNullable = false
  ) {
    this.context = context;
    this.elements = elements;
    this.type = elementType;
    this.isNullable = isNullable;
  }

  public getElements(): TycoValue[] {
    return this.elements;
  }

  public getValue(): TycoValueType[] {
    return this.elements.map(e => e.getValue());
  }

  public getType(): TycoBaseType {
    return this.type;
  }

  public isArrayType(): boolean {
    return true;
  }

  public canBeNull(): boolean {
    return this.isNullable;
  }

  public renderTemplate(parent: any): TycoValueType[] {
    return this.elements.map(e => e.renderTemplate(parent));
  }

  public clone(): TycoArray {
    const clonedElements = this.elements.map(e => e.clone());
    return new TycoArray(this.context, clonedElements, this.type, this.isNullable);
  }
}

export class TycoReference extends TycoValue {
  private typeName: string;
  private args: string[];
  private resolved: any = null;

  constructor(
    context: TycoContext,
    typeName: string,
    args: string[],
    type: TycoBaseType,
    isArray = false,
    isNullable = false
  ) {
    super(context, null, type, isArray, isNullable);
    this.typeName = typeName;
    this.args = args;
  }

  public getTypeName(): string {
    return this.typeName;
  }

  public getArgs(): string[] {
    return this.args;
  }

  public resolve(): any {
    if (this.resolved) {
      return this.resolved;
    }

    // Convert args to primary key values
    const primaryKeyValues = this.args.map(arg => {
      // Simple conversion - in a full implementation, this would parse the arg properly
      if (arg === 'null') return null;
      if (arg === 'true') return true;
      if (arg === 'false') return false;
      if (!isNaN(Number(arg))) return Number(arg);
      if (arg.startsWith('"') && arg.endsWith('"')) return arg.slice(1, -1);
      if (arg.startsWith("'") && arg.endsWith("'")) return arg.slice(1, -1);
      return arg;
    });

    this.resolved = this.context.resolveReference(this.typeName, primaryKeyValues);
    if (!this.resolved) {
      throw new Error(`Cannot resolve reference ${this.typeName}(${this.args.join(', ')})`);
    }

    return this.resolved;
  }

  public getValue(): any {
    return this.resolve();
  }

  public renderTemplate(parent: any): any {
    return this.resolve();
  }

  public clone(): TycoReference {
    return new TycoReference(
      this.context,
      this.typeName,
      [...this.args],
      this.type,
      this.isArray,
      this.isNullable
    );
  }
}

export class TycoInstance {
  public typeName: string;
  public fields: Map<string, TycoValueType>;
  public parent: any = null;

  constructor(typeName: string, fields: Map<string, TycoValueType>) {
    this.typeName = typeName;
    this.fields = fields;
  }

  public setParent(parent: any): void {
    this.parent = parent;
  }

  public getField(name: string): TycoValueType | undefined {
    return this.fields.get(name);
  }

  public setField(name: string, value: TycoValueType): void {
    this.fields.set(name, value);
  }

  public renderTemplates(): void {
    // Render all template variables in this instance
    for (const [fieldName, fieldValue] of this.fields) {
      if (fieldValue instanceof TycoValue) {
        const rendered = fieldValue.renderTemplate(this);
        this.fields.set(fieldName, rendered);
      }
    }
  }

  public toObject(): any {
    const obj: any = {};
    for (const [key, value] of this.fields) {
      if (value instanceof TycoInstance) {
        obj[key] = value.toObject();
      } else if (Array.isArray(value)) {
        obj[key] = value.map(v => v instanceof TycoInstance ? v.toObject() : v);
      } else {
        obj[key] = value;
      }
    }
    return obj;
  }
}