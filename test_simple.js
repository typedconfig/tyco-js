const { loads } = require('./dist/index.js');
const fs = require('fs');

const content = fs.readFileSync('../tyco-test-suite/inputs/simple1.tyco', 'utf-8');
const result = loads(content);
console.log(JSON.stringify(result, null, 2));
