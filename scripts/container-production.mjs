import { spawn } from 'node:child_process';

const children = new Map();
let stopping = false;
let exitCode = 0;

function start(name, args, { restart = false } = {}) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env },
    stdio: 'inherit',
    windowsHide: true,
  });
  children.set(name, child);
  console.log(`[container] started ${name} pid=${child.pid}`);
  child.once('error', (error) => {
    console.error(`[container] ${name} failed to start:`, error);
  });
  child.once('exit', (code, signal) => {
    children.delete(name);
    if (stopping) return;
    if (name === 'web') {
      exitCode = code ?? 1;
      console.error(`[container] web exited code=${code ?? 'none'} signal=${signal ?? 'none'}`);
      shutdown('SIGTERM');
      return;
    }
    console.error(`[container] ${name} exited code=${code ?? 'none'} signal=${signal ?? 'none'}`);
    if (restart) {
      setTimeout(() => {
        if (!stopping && !children.has(name)) start(name, args, { restart });
      }, 15_000).unref();
    }
  });
  return child;
}

function shutdown(signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const [name, child] of children) {
    console.log(`[container] stopping ${name}`);
    try { child.kill(signal); } catch {}
  }
  setTimeout(() => process.exit(exitCode), 10_000).unref();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

start('web', ['scripts/control-plane-web.mjs', 'start']);

if (String(process.env.RUN_BACKGROUND_WORKERS ?? '').toLowerCase() === 'true') {
  start('worker', ['scripts/worker.mjs'], { restart: true });
  start('scheduler', ['scripts/scheduler.mjs'], { restart: true });
  console.log('[container] autonomous worker and scheduler enabled');
} else {
  console.log('[container] autonomous worker and scheduler disabled by RUN_BACKGROUND_WORKERS');
}

await new Promise(() => {});
