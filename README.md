# tyco-js

JavaScript/TypeScript implementation of the Tyco configuration language parser.

## Overview

Tyco is a configuration language designed for complex, structured configurations with strong typing and template capabilities. This JavaScript implementation provides full compatibility with the Python reference implementation, making Tyco configurations accessible in Node.js and browser environments.

## Features

- **Type Safety**: Built with TypeScript for compile-time type checking
- **Full Tyco Support**: Complete implementation of the Tyco specification
- **Template Variables**: Support for `{variable}` substitution in strings
- **Structured Data**: Define structs with typed fields and relationships
- **Arrays & References**: Handle collections and inter-object references
- **Multiple Formats**: Support for various number formats (hex, octal, binary)
- **Multiline Strings**: Triple-quoted strings with `"""` and `'''`
- **Primary Keys**: Automatic indexing with `*` field markers
- **Nullable Fields**: Optional fields with `?` notation
- **Error Handling**: Comprehensive error reporting with line numbers

## Installation

```bash
npm install tyco
```

## Quick Start

### Basic Usage

```javascript
const { load, loads } = require('tyco');

// Parse from file
const config = load('config.tyco');

// Parse from string
const config = loads(`
str environment: "production"
int port: 8080
bool debug: false
`);

console.log(config.environment); // "production"
console.log(config.port);        // 8080
console.log(config.debug);       // false
```

### TypeScript Usage

```typescript
import { load, loads, TycoParser } from 'tyco';

interface Config {
  environment: string;
  port: number;
  debug: boolean;
}

const config: Config = loads(`
str environment: "production"
int port: 8080
bool debug: false
`) as Config;
```

## Configuration Syntax

### Basic Types

```tyco
# Global variables with types
str environment: "production"
int port: 8080
float timeout: 30.5
bool debug: false
date release_date: 2024-01-15
time backup_time: 02:30:00
datetime last_update: 2024-01-15T10:30:00
```

### Arrays

```tyco
str[] environments: ["dev", "staging", "prod"]
int[] ports: [8080, 8081, 8082]
```

### Nullable Fields

```tyco
?str optional_field: null
?int optional_port: 3000
```

### Template Variables

```tyco
str host: "api.example.com"
str api_url: "https://{host}/v1"  # Resolves to "https://api.example.com/v1"
```

### Structs and Instances

```tyco
struct Database {
    *str name           # Primary key field
    str host
    int port: 5432      # Default value
    ?str description    # Nullable field
}

Database primary localhost 5432 "Main database"
Database replica db-replica.example.com 5432
Database cache redis.example.com 6379 null
```

### Number Formats

```tyco
int decimal: 255
int hex: 0xFF
int octal: 0o377
int binary: 0b11111111
```

### Multiline Strings

```tyco
str config: """
This is a multiline
configuration string
"""

str literal: '''Raw string with {no} variable substitution'''
```

## API Reference

### Functions

#### `load(filename: string): any`

Load and parse a Tyco configuration file.

**Parameters:**
- `filename`: Path to the .tyco file

**Returns:** Parsed configuration object

**Example:**
```javascript
const config = load('./config.tyco');
```

#### `loads(content: string): any`

Parse a Tyco configuration from a string.

**Parameters:**
- `content`: Tyco configuration content as string

**Returns:** Parsed configuration object

**Example:**
```javascript
const config = loads('str name: "example"');
```

### Classes

#### `TycoParser`

Main parser class for advanced usage.

```typescript
const parser = new TycoParser();
const result = parser.parse(content);
```

#### `TycoLexer`

Lexical analyzer for tokenizing Tyco content.

#### `TycoContext`

Context manager for storing globals, structs, and instances.

## Development

### Prerequisites

- Node.js 14 or higher
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/tyco-js.git
cd tyco-js

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint

# Format code
npm run format
```

### Project Structure

```
tyco-js/
├── src/                    # Source code
│   ├── index.ts           # Main exports
│   ├── parser.ts          # Main parser class
│   ├── lexer.ts           # Lexical analyzer
│   ├── context.ts         # Context management
│   ├── values.ts          # Value wrapper classes
│   └── types.ts           # TypeScript type definitions
├── test/                  # Test files
│   └── parser.test.ts     # Comprehensive test suite
├── examples/              # Example configurations
│   └── basic.tyco         # Basic usage example
├── dist/                  # Compiled JavaScript output
└── docs/                  # Documentation
```

### Testing

The project uses Jest for testing with comprehensive coverage:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Building

TypeScript compilation with strict type checking:

```bash
# Build once
npm run build

# Build in watch mode
npm run build:watch
```

## Compatibility

This JavaScript implementation maintains full compatibility with:
- **tyco-python**: The reference Python implementation
- **tyco-cpp**: The C++ implementation

All three implementations pass the same test suite and produce identical parsing results.

## Error Handling

The parser provides detailed error messages with line numbers:

```javascript
try {
  const config = loads(`
    str name: "test"
    invalid syntax here
  `);
} catch (error) {
  console.error(error.message);
  // "Malformed config file at line 3: invalid syntax here"
}
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass (`npm test`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

### Code Style

The project uses ESLint and Prettier for consistent code formatting:

```bash
# Check linting
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Changelog

### [0.1.0] - 2024-11-07

#### Added
- Initial JavaScript/TypeScript implementation
- Complete Tyco language support
- Comprehensive test suite
- TypeScript type definitions
- ESLint and Prettier configuration
- Jest testing framework
- Example configurations
- Full documentation

#### Features
- Global variable declarations
- Struct definitions with typed fields
- Primary key support with `*` notation
- Nullable fields with `?` notation
- Array support with `[]` notation
- Template variable substitution
- Multiline strings with `"""` and `'''`
- Number format support (decimal, hex, octal, binary)
- Reference resolution between struct instances
- Comprehensive error handling

## Related Projects

- [tyco-python](https://github.com/yourusername/tyco-python) - Reference Python implementation
- [tyco-cpp](https://github.com/yourusername/tyco-cpp) - C++ implementation

## Support

For questions, issues, or contributions:

- **Issues**: [GitHub Issues](https://github.com/yourusername/tyco-js/issues)
- **Documentation**: [Project Wiki](https://github.com/yourusername/tyco-js/wiki)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/tyco-js/discussions)