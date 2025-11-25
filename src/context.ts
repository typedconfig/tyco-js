/**
 * TycoContext - Main container for parsed Tyco content
 */

import * as fs from 'fs';
import { TycoGlobalValue, TycoStructSchema, TycoStructInstance, TycoParseResult } from './types';

export class TycoContext {
  private globals: Map<string, TycoGlobalValue> = new Map();
  private structs: Map<string, TycoStructSchema> = new Map();
  private instances: Map<string, TycoStructInstance[]> = new Map();

  public setGlobal(name: string, value: TycoGlobalValue): void {
    if (this.globals.has(name)) {
      throw new Error(`Duplicate global attribute: ${name}`);
    }
    this.globals.set(name, value);
  }

  public getGlobal(name: string): TycoGlobalValue | undefined {
    return this.globals.get(name);
  }

  public addStruct(typeName: string): TycoStruct {
    if (this.structs.has(typeName)) {
      return new TycoStruct(this, this.structs.get(typeName)!);
    }

    const schema: TycoStructSchema = {
      typeName,
      fields: new Map(),
      primaryKeys: [],
      nullableKeys: new Set(),
      arrayKeys: new Set(),
    };

    this.structs.set(typeName, schema);
    this.instances.set(typeName, []);
    return new TycoStruct(this, schema);
  }

  public getStruct(typeName: string): TycoStructSchema | undefined {
    return this.structs.get(typeName);
  }

  public getInstances(typeName: string): TycoStructInstance[] {
    return this.instances.get(typeName) || [];
  }

  public addInstance(typeName: string, instance: TycoStructInstance): void {
    const instances = this.instances.get(typeName);
    if (instances) {
      instances.push(instance);
    } else {
      this.instances.set(typeName, [instance]);
    }
  }

  public resolveReference(typeName: string, primaryKeyValues: any[]): TycoStructInstance | null {
    const instances = this.getInstances(typeName);
    const struct = this.getStruct(typeName);
    
    if (!struct || struct.primaryKeys.length === 0) {
      return null;
    }

    for (const instance of instances) {
      if (this.matchesPrimaryKeys(instance, struct.primaryKeys, primaryKeyValues)) {
        return instance;
      }
    }

    return null;
  }

  private matchesPrimaryKeys(instance: TycoStructInstance, primaryKeys: string[], values: any[]): boolean {
    if (primaryKeys.length !== values.length) {
      return false;
    }

    for (let i = 0; i < primaryKeys.length; i++) {
      const primaryKey = primaryKeys[i];
      if (!primaryKey) continue;
      
      const fieldValue = instance.fields.get(primaryKey);
      if (fieldValue !== values[i]) {
        return false;
      }
    }

    return true;
  }

  public renderTemplates(): void {
    // Template rendering will be implemented in phase 2
    // This is where {variable} substitution happens
  }

  public toJSON(): TycoParseResult {
    return {
      globals: new Map(this.globals),
      structs: new Map(this.structs),
      instances: new Map(this.instances),
    };
  }

  public asJson(): TycoParseResult {
    return this.toJSON();
  }

  public asObject(): any {
    const result: any = {};

    // Add globals to result
    for (const [name, global] of this.globals) {
      result[name] = global.value;
    }

    // Add struct instances to result
    for (const [typeName, instances] of this.instances) {
      if (instances.length > 0) {
        result[typeName] = instances.map(instance => {
          const obj: any = {};
          for (const [fieldName, fieldValue] of instance.fields) {
            obj[fieldName] = fieldValue;
          }
          return obj;
        });
      }
    }

    return result;
  }

  public toObject(): any {
    return this.asObject();
  }

  public dumpsJson(indent = 2): string {
    return JSON.stringify(this.asJson(), null, indent);
  }

  public dumpJson(filePath: string, indent = 2): void {
    fs.writeFileSync(filePath, this.dumpsJson(indent));
  }
}

export class TycoStruct {
  public typeName: string;
  private context: TycoContext;
  private schema: TycoStructSchema;

  constructor(context: TycoContext, schema: TycoStructSchema) {
    this.context = context;
    this.schema = schema;
    this.typeName = schema.typeName;
  }

  public addField(name: string, field: any): void {
    this.schema.fields.set(name, field);
    
    if (field.isPrimaryKey) {
      this.schema.primaryKeys.push(name);
    }
    
    if (field.isNullable) {
      this.schema.nullableKeys.add(name);
    }
    
    if (field.isArray) {
      this.schema.arrayKeys.add(name);
    }
  }

  public addInstance(values: any[], defaults: Map<string, any>): void {
    const fieldNames = Array.from(this.schema.fields.keys());
    const instance: TycoStructInstance = {
      typeName: this.typeName,
      fields: new Map(),
      primaryKeyValues: [],
    };

    // Process positional arguments
    let positionalIndex = 0;
    const namedArgs: Map<string, any> = new Map();

    for (const value of values) {
      if (typeof value === 'string' && value.includes(':') && !value.includes('://')) {
        // Named argument (but not URLs)
        const parts = value.split(':', 2);
        const name = parts[0];
        const val = parts[1];
        if (name && val) {
          namedArgs.set(name.trim(), val.trim());
        }
      } else if (positionalIndex < fieldNames.length) {
        // Positional argument
        const fieldName = fieldNames[positionalIndex];
        if (fieldName) {
          namedArgs.set(fieldName, value);
        }
        positionalIndex++;
      }
    }

    // Set field values with defaults and proper type conversion
    for (const fieldName of fieldNames) {
      let fieldValue = namedArgs.get(fieldName);
      
      if (fieldValue === undefined && defaults.has(fieldName)) {
        fieldValue = defaults.get(fieldName);
      }
      
      if (fieldValue === undefined) {
        throw new Error(`Missing value for field ${fieldName} in ${this.typeName}`);
      }

      // Convert the field value based on the field schema
      const fieldSchema = this.schema.fields.get(fieldName);
      if (fieldSchema && typeof fieldValue === 'string') {
        fieldValue = this.convertFieldValue(fieldValue, fieldSchema);
      }

      instance.fields.set(fieldName, fieldValue);
    }

    // Extract primary key values
    for (const pkField of this.schema.primaryKeys) {
      const fieldValue = instance.fields.get(pkField);
      if (fieldValue !== undefined && (typeof fieldValue === 'string' || typeof fieldValue === 'number' || typeof fieldValue === 'boolean' || fieldValue === null || fieldValue instanceof Date)) {
        instance.primaryKeyValues.push(fieldValue);
      }
    }

    this.context.addInstance(this.typeName, instance);
  }

  private convertFieldValue(value: string, fieldSchema: any): any {
    if (fieldSchema.isNullable && value === 'null') {
      return null;
    }

    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    switch (fieldSchema.type) {
      case 'int':
        if (value.startsWith('0x')) {
          return parseInt(value, 16);
        } else if (value.startsWith('0o')) {
          return parseInt(value.slice(2), 8);
        } else if (value.startsWith('0b')) {
          return parseInt(value.slice(2), 2);
        } else {
          return parseInt(value, 10);
        }
      case 'float':
        return parseFloat(value);
      case 'bool':
        if (value === 'true') return true;
        if (value === 'false') return false;
        throw new Error(`Invalid boolean value: ${value}`);
      case 'date':
        return new Date(value + 'T00:00:00.000Z');
      case 'time':
        return new Date(`1970-01-01T${value}.000Z`);
      case 'datetime':
        return new Date(value);
      case 'str':
      default:
        return value;
    }
  }
}
