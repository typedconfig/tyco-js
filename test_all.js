#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { load } = require('./dist/index.js');

const INPUTS_DIR = '../tyco-test-suite/inputs';
const EXPECTED_DIR = '../tyco-test-suite/expected';

// Get all .tyco files
const inputFiles = fs.readdirSync(INPUTS_DIR)
  .filter(f => f.endsWith('.tyco'))
  .sort();

let passed = 0;
let failed = 0;
const failures = [];

for (const inputFile of inputFiles) {
  const baseName = inputFile.replace('.tyco', '');
  const expectedFile = `${baseName}.json`;
  
  const inputPath = path.join(INPUTS_DIR, inputFile);
  const expectedPath = path.join(EXPECTED_DIR, expectedFile);
  
  if (!fs.existsSync(expectedPath)) {
    console.log(`SKIP ${baseName} - no expected file`);
    continue;
  }
  
  try {
    const result = load(inputPath);
    const actual = JSON.stringify(result, null, 2);
    const expected = fs.readFileSync(expectedPath, 'utf8').trim();
    
    // Normalize JSON for comparison (handles 0 vs 0.0, whitespace, etc.)
    const actualObj = JSON.parse(actual);
    const expectedObj = JSON.parse(expected);
    const actualNorm = JSON.stringify(actualObj, null, 2);
    const expectedNorm = JSON.stringify(expectedObj, null, 2);
    
    if (actualNorm === expectedNorm) {
      console.log(`PASS ${baseName}`);
      passed++;
    } else {
      console.log(`FAIL ${baseName}`);
      failed++;
      failures.push({
        name: baseName,
        expected: expectedNorm,
        actual: actualNorm
      });
    }
  } catch (error) {
    console.log(`ERROR ${baseName}: ${error.message}`);
    failed++;
    failures.push({
      name: baseName,
      error: error.message,
      stack: error.stack
    });
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failures.length > 0) {
  console.log(`\n${'='.repeat(70)}`);
  console.log('FAILURES:');
  for (const failure of failures) {
    console.log(`\n${'-'.repeat(70)}`);
    console.log(`Test: ${failure.name}`);
    if (failure.error) {
      console.log(`Error: ${failure.error}`);
      if (process.argv.includes('--verbose')) {
        console.log(failure.stack);
      }
    } else {
      console.log('\nExpected:');
      console.log(failure.expected.substring(0, 500));
      console.log('\nActual:');
      console.log(failure.actual.substring(0, 500));
    }
  }
}

process.exit(failed > 0 ? 1 : 0);
