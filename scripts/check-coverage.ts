/**
 * Coverage ratchet: ensures coverage never drops below the stored threshold,
 * and automatically tightens the threshold when coverage improves.
 */

import * as fs from 'fs';
import * as path from 'path';

const THRESHOLD_FILE = path.join(__dirname, '..', '.coverage-threshold.json');
const COVERAGE_SUMMARY = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');

interface CoverageMetrics {
  lines: number;
  branches: number;
  functions: number;
  statements: number;
}

function readThreshold(): CoverageMetrics {
  return JSON.parse(fs.readFileSync(THRESHOLD_FILE, 'utf-8')) as CoverageMetrics;
}

function readCoverage(): CoverageMetrics {
  if (!fs.existsSync(COVERAGE_SUMMARY)) {
    console.error('No coverage report found. Run `npm run test:coverage` first.');
    process.exit(1);
  }

  const summary = JSON.parse(fs.readFileSync(COVERAGE_SUMMARY, 'utf-8')) as Partial<
    Record<string, Record<string, { pct: number }>>
  >;
  const total = summary['total'];
  if (total === undefined) {
    console.error('Coverage summary missing "total" key.');
    process.exit(1);
  }

  const lines = total['lines'];
  const branches = total['branches'];
  const functions = total['functions'];
  const statements = total['statements'];
  if (!lines || !branches || !functions || !statements) {
    console.error('Coverage summary missing expected metric keys.');
    process.exit(1);
  }

  return {
    lines: Math.floor(lines.pct),
    branches: Math.floor(branches.pct),
    functions: Math.floor(functions.pct),
    statements: Math.floor(statements.pct),
  };
}

const threshold = readThreshold();
const actual = readCoverage();

const metrics: (keyof CoverageMetrics)[] = ['lines', 'branches', 'functions', 'statements'];
let failed = false;
let ratcheted = false;

for (const key of metrics) {
  if (actual[key] < threshold[key]) {
    console.error(
      `Coverage regression: ${key} dropped from ${String(threshold[key])}% to ${String(actual[key])}%`,
    );
    failed = true;
  } else if (actual[key] > threshold[key]) {
    console.log(
      `Coverage improved: ${key} ${String(threshold[key])}% -> ${String(actual[key])}% (ratcheting up)`,
    );
    threshold[key] = actual[key];
    ratcheted = true;
  }
}

if (ratcheted) {
  fs.writeFileSync(THRESHOLD_FILE, JSON.stringify(threshold, null, 2) + '\n');
  console.log('Threshold updated in .coverage-threshold.json');
}

if (failed) {
  process.exit(1);
} else {
  console.log('Coverage check passed.');
}
