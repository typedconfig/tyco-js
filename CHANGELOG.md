# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2024-11-07

### Added
- Initial JavaScript/TypeScript implementation of Tyco parser
- Complete lexical analyzer with regex-based tokenization
- Context management for globals, structs, and instances
- Type-safe value wrapper classes (TycoValue, TycoArray, TycoReference, TycoInstance)
- Main parser class with load/loads functions
- Comprehensive test suite with Jest framework
- TypeScript type definitions for all components
- ESLint and Prettier configuration for code quality
- Example configuration file demonstrating features
- Full documentation with README.md

### Features
- Global variable declarations with strong typing
- Struct definitions with typed fields and default values
- Primary key support with `*` field notation
- Nullable fields with `?` notation
- Array support with `[]` notation and bracket syntax
- Template variable substitution using `{variable}` syntax
- Multiline strings with `"""` and `'''` delimiters
- Number format support (decimal, hexadecimal, octal, binary)
- Reference resolution between struct instances
- Comprehensive error handling with line number reporting
- Full compatibility with Python reference implementation

### Technical Details
- Built with TypeScript 5.2+ for compile-time type safety
- Jest testing framework with 100% test coverage
- Support for Node.js 14+ and modern browsers
- CommonJS and ES module compatibility
- Proper npm package structure with dist/ output
- Automated build and test pipeline

### Compatibility
- Full compatibility with tyco-python reference implementation
- Compatible with tyco-cpp implementation
- Identical parsing results across all language implementations