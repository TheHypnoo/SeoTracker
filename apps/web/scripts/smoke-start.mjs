import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const serverEntry = new URL('../.output/server/index.mjs', import.meta.url);

if (!existsSync(serverEntry)) {
  console.error('Missing production server build. Run `pnpm build` before smoke-start.');
  process.exit(1);
}

const port = process.env.SMOKE_PORT ?? String(41_000 + Math.floor(Math.random() * 1_000));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [serverEntry.pathname], {
  cwd: new URL('..', import.meta.url),
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    NITRO_HOST: '127.0.0.1',
    NITRO_PORT: port,
    NODE_ENV: 'production',
    PORT: port,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
server.stdout.on('data', (chunk) => {
  output += chunk.toString();
});
server.stderr.on('data', (chunk) => {
  output += chunk.toString();
});

async function stopServer() {
  if (server.exitCode !== null) {
    return;
  }

  server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => {
      server.once('exit', resolve);
    }),
    delay(1_000).then(() => {
      if (server.exitCode === null) {
        server.kill('SIGKILL');
      }
    }),
  ]);
}

try {
  let lastError;

  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Frontend server exited early with code ${server.exitCode}.\n${output}`);
    }

    try {
      const response = await fetch(`${origin}/health`);
      const body = await response.text();
      if (response.ok && body.includes('ok')) {
        console.log(`Frontend smoke start passed at ${origin}/health`);
        process.exitCode = 0;
        break;
      }
      lastError = new Error(`Unexpected health response: ${response.status} ${body}`);
    } catch (error) {
      lastError = error;
    }

    await delay(200);
  }

  if (process.exitCode !== 0) {
    throw new Error(
      `Frontend server did not become healthy at ${origin}/health.\n${lastError}\n${output}`,
    );
  }
} finally {
  await stopServer();
}
