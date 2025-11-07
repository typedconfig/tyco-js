import { TycoParser, load, loads } from '../src/index';

describe('TycoParser', () => {
  describe('Basic Parsing', () => {
    test('should parse global variables', () => {
      const content = `
str environment: production
bool debug: false
int port: 8080
float timeout: 30.5
`;
      
      const result = loads(content);
      
      expect(result.environment).toBe('production');
      expect(result.debug).toBe(false);
      expect(result.port).toBe(8080);
      expect(result.timeout).toBe(30.5);
    });

    test('should parse basic types', () => {
      const content = `
str string_value: demo
str quoted_string: "hello world"
int integer_value: 42
int negative_int: -100
float float_value: 3.14159
float negative_float: -2.5
bool true_value: true
bool false_value: false
`;
      
      const result = loads(content);
      
      expect(result.string_value).toBe('demo');
      expect(result.quoted_string).toBe('hello world');
      expect(result.integer_value).toBe(42);
      expect(result.negative_int).toBe(-100);
      expect(result.float_value).toBe(3.14159);
      expect(result.negative_float).toBe(-2.5);
      expect(result.true_value).toBe(true);
      expect(result.false_value).toBe(false);
    });

    test('should parse struct definitions', () => {
      const content = `
Server:
 *str name:
  int port:
  str host:
  - web1, 8080, web1.example.com
  - api1, 3000, api1.example.com
`;
      
      const result = loads(content);
      
      expect(Array.isArray(result.Server)).toBe(true);
      expect(result.Server).toHaveLength(2);
      expect(result.Server[0].name).toBe('web1');
      expect(result.Server[0].port).toBe(8080);
      expect(result.Server[0].host).toBe('web1.example.com');
    });

    test('should handle nullable fields', () => {
      const content = `
?str optional_string: null
?str optional_with_value: "present"

User:
 *str username:
  str email:
 ?str nickname:
  - alice, alice@example.com, "Ali"
  - bob, bob@example.com, null
`;
      
      const result = loads(content);
      
      expect(result.optional_string).toBeNull();
      expect(result.optional_with_value).toBe('present');
      expect(result.User[0].nickname).toBe('Ali');
      expect(result.User[1].nickname).toBeNull();
    });

    test('should parse arrays', () => {
      const content = `
str[] environments: [dev, staging, prod]
int[] ports: [80, 443, 8080]
?int[] optional_array: null
`;
      
      const result = loads(content);
      
      expect(Array.isArray(result.environments)).toBe(true);
      expect(result.environments).toEqual(['dev', 'staging', 'prod']);
      expect(result.ports).toEqual([80, 443, 8080]);
      expect(result.optional_array).toBeNull();
    });

    test('should handle hex, octal, and binary numbers', () => {
      const content = `
int hex_value: 0xFF
int octal_value: 0o777  
int binary_value: 0b1010
`;
      
      const result = loads(content);
      
      expect(result.hex_value).toBe(255);
      expect(result.octal_value).toBe(511);
      expect(result.binary_value).toBe(10);
    });

    test('should handle multiline strings', () => {
      const content = `
str multiline: """
This is a
multiline string
"""
str literal_string: '''This is a literal string with {no} substitution'''
`;
      
      const result = loads(content);
      
      expect(result.multiline).toBe('This is a\nmultiline string\n');
      expect(result.literal_string).toBe('This is a literal string with {no} substitution');
    });
  });

  describe('Error Handling', () => {
    test('should throw error for invalid syntax', () => {
      const content = 'invalid syntax here';
      
      expect(() => loads(content)).toThrow();
    });

    test('should throw error for duplicate globals', () => {
      const content = `
str environment: production  
str environment: staging
`;
      
      expect(() => loads(content)).toThrow('Duplicate global attribute');
    });

    test('should throw error for primary key on array', () => {
      const content = `
Test:
 *str[] invalid_primary_key:
`;
      
      expect(() => loads(content)).toThrow('Cannot set a primary key on an array');
    });
  });

  describe('Integration', () => {
    test('should parse complex configuration', () => {
      const content = `
str environment: production
bool debug: false

Database:
 *str name:
  str host:
  int port:
  - primary, localhost, 5432
  - replica, replica-host, 5432

Server:
 *str name:
  int port:
  str host:
 ?str description:
  - web1, 8080, web1.example.com, "Primary web server"
  - api1, 3000, api1.example.com, null
`;
      
      const result = loads(content);
      
      expect(result.environment).toBe('production');
      expect(result.debug).toBe(false);
      expect(result.Database).toHaveLength(2);
      expect(result.Server).toHaveLength(2);
      expect(result.Server[0].description).toBe('Primary web server');
      expect(result.Server[1].description).toBeNull();
    });
  });
});