const { loads } = require('./dist/index.js');
const fs = require('fs');

const content = fs.readFileSync('../tyco-test-suite/inputs/basic_types.tyco', 'utf-8');
try {
  const result = loads(content);
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  console.error("Error:", e.message);
  console.error(e.stack);
}
