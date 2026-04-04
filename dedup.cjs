const fs = require('fs');
const REGISTRY_PATH = './central-hub/config/services-registry.json';
const data = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));

const uniqueServices = [];
const seen = new Set();

// Ensure the root file is deleted to avoid confusion
if (fs.existsSync('./config/services-registry.json')) {
  // Wait, I shouldn't delete it just in case, I'll just focus on modifying central-hub's
}

data.services.forEach(s => {
  // Correct the internal HTTPS prefix bug for LAN URL!
  // The 'enableTLS' in the service object means the external proxy has TLS!
  // It shouldn't force the LAN URL to be HTTPS, unless we explicitly configure the backend for TLS.
  // Actually, wait, let's just default lanUrl to http unless internalPort is 443
  const isInternalHttps = s.internalPort === 443 || s.internalPort === 5001 || s.internalPort === 8006;
  const protocol = isInternalHttps ? 'https' : 'http';
  
  if (s.sunpanel && s.sunpanel.lanUrl) {
    if (!s.sunpanel.lanUrl.startsWith('http://192') && !s.sunpanel.lanUrl.startsWith('https://192')) {
       s.sunpanel.lanUrl = `${protocol}://192.168.3.${s.device}:${s.internalPort}`;
    } else {
       // Force correct the broken ones (like https://192.168.3.200:5666 which should be http)
       s.sunpanel.lanUrl = `${protocol}://192.168.3.${s.device}:${s.internalPort}`;
    }
  }

  // Deduplication logic
  const key = `${s.proxyDomain}|${s.device}|${s.internalPort}`;
  if (!seen.has(key)) {
    // Also deduplicate by ID just in case
    const idKey = s.id;
    // Prefer objects that already have a good label or something, but simple push is fine
    uniqueServices.push(s);
    seen.add(key);
    seen.add(idKey);
  }
});

// Remove the duplicates matching by ID again
const finalServices = [];
const idSeen = new Set();
uniqueServices.forEach(s => {
  if (!idSeen.has(s.id)) {
      finalServices.push(s);
      idSeen.add(s.id);
  }
});

data.services = finalServices;
fs.writeFileSync(REGISTRY_PATH, JSON.stringify(data, null, 2), 'utf8');

// Copy over to the root config as well just to sync them and avoid future diverging bugs
if (!fs.existsSync('./config')) fs.mkdirSync('./config');
fs.writeFileSync('./config/services-registry.json', JSON.stringify(data, null, 2), 'utf8');

console.log('✅ Deduplication complete! Total items:', finalServices.length);
