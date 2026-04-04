import { CentralHub } from './central-hub/server.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(MODULE_DIR, 'config', 'hub.json');

const hub = new CentralHub(configPath);
await hub.loadConfig();
await hub.initModules();

const rawProxies = await import('./lib/api-clients/lucky-port-manager.mjs').then(m => m.getAllProxies(hub.modules.luckyManager.luckyConfig));
console.log(JSON.stringify(rawProxies[0], null, 2));
process.exit(0);
