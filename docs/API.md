# API Documentation

## Table of Contents

- [Parser Functions](#parser-functions)
- [Main Classes](#main-classes)
- [Type Definitions](#type-definitions)
- [Error Handling](#error-handling)
- [Examples](#examples)

## Parser Functions

### `load(filename: string): any`

Loads and parses a Tyco configuration file from the filesystem.

**Parameters:**
- `filename` (string): Path to the .tyco configuration file

**Returns:** Object containing parsed configuration data

**Throws:** Error if file cannot be read or contains invalid syntax

**Example:**
```javascript
const config = load('./config/database.tyco');
console.log(config.Database[0].host); // Access parsed data
```

### `loads(content: string): any`

Parses Tyco configuration content from a string.

**Parameters:**
- `content` (string): Tyco configuration content as a string

**Returns:** Object containing parsed configuration data  

**Throws:** Error if content contains invalid syntax

**Example:**
```javascript
const configString = `
str environment: "production"
int port: 8080
`;
const config = loads(configString);
console.log(config.environment); // "production"
```

## Main Classes

### `TycoParser`

The main parser class that orchestrates the parsing process.

#### Constructor
```typescript
new TycoParser()
```

#### Methods

##### `parse(content: string): any`

Parses the given Tyco content and returns the configuration object.

**Parameters:**
- `content` (string): Tyco configuration content

**Returns:** Parsed configuration object

### `TycoLexer`

Lexical analyzer that tokenizes Tyco configuration content.

#### Static Methods

##### `fromFile(filename: string): TycoLexer`

Creates a lexer instance from a file.

**Parameters:**
- `filename` (string): Path to the configuration file

**Returns:** TycoLexer instance

##### `fromString(content: string): TycoLexer`

Creates a lexer instance from a string.

**Parameters:**
- `content` (string): Configuration content

**Returns:** TycoLexer instance

#### Instance Methods

##### `process(): void`

Processes the configuration content and populates the context.

### `TycoContext`

Manages the parsing context including globals, structs, and instances.

#### Methods

##### `setGlobal(name: string, global: TycoGlobal): void`

Sets a global variable in the context.

##### `getGlobal(name: string): TycoGlobal | undefined`

Retrieves a global variable from the context.

##### `addStruct(name: string, schema: TycoStructSchema): void`

Adds a struct definition to the context.

##### `getStruct(name: string): TycoStruct | undefined`

Retrieves a struct helper by name.

##### `addInstance(typeName: string, instance: TycoStructInstance): void`

Adds a struct instance to the context.

### Value Classes

#### `TycoValue`

Base class for all Tyco values with template rendering support.

##### `getValue(): any`

Returns the resolved value with template substitution applied.

##### `getRawValue(): any`

Returns the raw value without template processing.

#### `TycoArray`

Represents Tyco arrays with type validation.

#### `TycoReference`

Represents references to struct instances.

#### `TycoInstance`

Represents struct instances with field validation.

## Type Definitions

### `TycoBaseType`

Basic Tyco data types:
```typescript
type TycoBaseType = 'str' | 'int' | 'float' | 'bool' | 'date' | 'time' | 'datetime';
```

### `TycoValueType`

Extended value types including arrays and references:
```typescript
type TycoValueType = TycoBaseType | 'array' | 'reference' | 'instance';
```

### `TycoGlobal`

Global variable definition:
```typescript
interface TycoGlobal {
  type: TycoBaseType;
  value: any;
  isArray: boolean;
  isNullable: boolean;
  raw: string;
}
```

### `TycoStructSchema`

Struct schema definition:
```typescript
interface TycoStructSchema {
  name: string;
  fields: Map<string, TycoFieldSchema>;
  primaryKeys: string[];
}
```

### `TycoFieldSchema`

Field schema definition:
```typescript
interface TycoFieldSchema {
  type: TycoBaseType;
  isArray: boolean;
  isNullable: boolean;
  isPrimaryKey: boolean;
  defaultValue?: any;
}
```

## Error Handling

The parser provides detailed error messages with line numbers for debugging:

### Common Error Types

1. **Syntax Errors**: Invalid Tyco syntax
2. **Type Errors**: Type mismatches or invalid type names
3. **Reference Errors**: Invalid struct references
4. **Missing Value Errors**: Required fields without values

### Example Error Messages

```
Malformed config file at line 5: invalid syntax here
Missing value for field 'host' in Database
Invalid global declaration: missing type
```

## Examples

### Basic Configuration

```tyco
# Global settings
str environment: "production"
int port: 8080
bool debug: false
float timeout: 30.5
```

### Struct Definitions

```tyco
struct Server {
    *str name           # Primary key
    str host
    int port: 80        # Default value
    ?str description    # Nullable field
}

Server web1 "web.example.com" 8080 "Primary web server"
Server api1 "api.example.com" 3000
```

### Arrays and References

```tyco
str[] environments: ["dev", "staging", "prod"]

struct Database {
    *str name
    str host
    int port: 5432
}

struct Service {
    *str name
    Database database   # Reference to Database instance
}

Database main "db.example.com" 5432
Service api Database(main)
```

### Template Variables

```tyco
str base_url: "https://api.example.com"
str users_endpoint: "{base_url}/users"
str orders_endpoint: "{base_url}/orders"
```

### Multiline Strings

```tyco
str sql_query: """
SELECT users.id, users.name, orders.total
FROM users
JOIN orders ON users.id = orders.user_id
WHERE orders.created_at > '2024-01-01'
"""

str literal_string: '''This is literal: {no_substitution}'''
```