import { spawn } from 'node:child_process';

const children = new Map();
let stopping = false;
let exitCode = 0;

function start(name, args, { restart = false, envOverrides = {} } = {}) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...envOverrides },
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
        if (!stopping && !children.has(name)) start(name, args, { restart, envOverrides });
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

// Apply idempotent database migrations before exposing the web control plane.
// Workers Builds runs this inside the Cloudflare container; nothing is executed
// on the creator's workstation. A failed migration must stop the container so
// production never runs against a partially upgraded schema.
const migration = spawn(process.execPath, ['scripts/migrate.mjs'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
});
const migrationCode = await new Promise((resolveMigration) => {
  migration.once('error', () => resolveMigration(1));
  migration.once('exit', (code) => resolveMigration(code ?? 1));
});
if (migrationCode !== 0) throw new Error(`Database migration failed with exit code ${migrationCode}`);

start('web', ['scripts/control-plane-web.mjs', 'start']);

if (String(process.env.RUN_BACKGROUND_WORKERS ?? '').toLowerCase() === 'true') {
  // Keep interactive production independent from post-processing, analytics
  // and maintenance jobs. Both workers still use the DB lease, so they never
  // claim the same job, while a finished render can return immediately.
  start('worker', ['scripts/worker.mjs'], { restart: true, envOverrides: { WORKER_ROLE: 'interactive' } });
  start('background-worker', ['scripts/worker.mjs'], { restart: true, envOverrides: { WORKER_ROLE: 'background' } });
  start('scheduler', ['scripts/scheduler.mjs'], { restart: true });
  console.log('[container] autonomous interactive/background workers and scheduler enabled');
} else {
  console.log('[container] autonomous worker and scheduler disabled by RUN_BACKGROUND_WORKERS');
}

await new Promise(() => {});
