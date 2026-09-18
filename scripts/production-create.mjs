#!/usr/bin/env node
/**
 * Canonical command-line entry point for sourced production.  It deliberately
 * forwards to the same orchestrator used by /create; benchmark inputs live in
 * run artifacts rather than in this executable.
 */
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const has = (name) => args.includes(name);
const modeIndex = args.indexOf('--mode');
const requestedMode = modeIndex >= 0 ? args[modeIndex + 1] : 'sourced';
if (requestedMode === 'radar' ? false : (!has('--prompt') && !has('--script') && !has('--script-path'))) {
  console.error('Usage: npm run production:create -- --prompt "..." [--duration 75] | --script path | --mode radar');
  process.exitCode = 2;
} else {
  const child = spawn(process.execPath, ['--env-file-if-exists=.env.local', 'scripts/run-autonomous-studio.mjs', '--mode', requestedMode, ...args.filter((arg, index) => index !== modeIndex && index !== modeIndex + 1)], {
    cwd: root,
    stdio: 'inherit',
  });
  child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
}
