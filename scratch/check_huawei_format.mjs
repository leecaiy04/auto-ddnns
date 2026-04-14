import { Client } from 'ssh2';
import { getEnv } from '../lib/utils/env-loader.mjs';

const config = {
  host: getEnv('ROUTER_HOST', '192.168.3.1'),
  username: getEnv('ROUTER_USERNAME', 'root'),
  password: getEnv('ROUTER_PASSWORD', ''),
  port: 22
};

const conn = new Client();
let state = "INIT";

conn.on('ready', () => {
  console.log('READY');
  conn.shell((err, stream) => {
    if (err) throw err;
    stream.on('data', (data) => {
      const chunk = data.toString();
      console.log('RECV[' + state + ']:', JSON.stringify(chunk));
      
      if (chunk.includes('Login:')) {
        stream.write(config.username + '\n');
        state = 'SENT_USER';
      } else if (chunk.includes('Password:')) {
        stream.write(config.password + '\n');
        state = 'SENT_PASS';
      } else if ((state === 'SENT_PASS' || state === 'INIT') && (chunk.includes('>') || chunk.includes('#') || chunk.includes('$'))) {
        console.log('PROMPT DETECTED');
        state = 'RUNNING';
        stream.write('display ipv6 neighbor\n');
        setTimeout(() => stream.write('display arp\n'), 3000);
        setTimeout(() => stream.write('quit\n'), 6000);
      }
    });
    
    setTimeout(() => { if (state === 'INIT') stream.write('\n'); }, 1000);
    setTimeout(() => { conn.end(); }, 15000);
  });
}).connect(config);
