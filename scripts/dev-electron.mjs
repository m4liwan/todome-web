/**
 * Development: starts the Vite dev server (hot reload) and opens it in Electron.
 * Usage: npm run app:dev
 */
import { spawn } from 'node:child_process';
import electronPath from 'electron';
import { createServer } from 'vite';

const server = await createServer({ server: { port: 5173 } });
await server.listen();
const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5173/';
console.log(`[todome] dev server ${url}`);

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url },
});

const shutdown = async (code) => {
  await server.close();
  process.exit(code ?? 0);
};
child.on('exit', (code) => void shutdown(code));
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
