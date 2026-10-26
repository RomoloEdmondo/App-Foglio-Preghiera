import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { setTimeout as delay } from 'node:timers/promises';

// Reuse only the public connection settings already shipped with the site.
const context = { window: {} };
vm.runInNewContext(readFileSync(new URL('../supabase-config.js', import.meta.url), 'utf8'), context);
const { url, anonKey } = context.window.FOGLIO_PREGHIERA_SUPABASE;

// Three real database requests, with bounded retries for temporary outages.
for (let check = 1; check <= 3; check++) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`${url}/rest/v1/rpc/app_healthcheck`, {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (await response.json() !== true) throw new Error('Unexpected healthcheck response');
      console.log(`Database check ${check}/3 passed`);
      break;
    } catch (error) {
      if (attempt === 3) throw error;
      console.warn(`Check ${check}, attempt ${attempt} failed: ${error.message}; retrying`);
      await delay(10_000);
    }
  }
}
