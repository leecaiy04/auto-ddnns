import { Client } from 'ssh2';
import { getEnv } from '../lib/utils/env-loader.mjs';

const config = {
  host: getEnv('ROUTER_HOST', '192.168.3.1'),
  username: getEnv('ROUTER_USERNAME', 'root'),
  password: getEnv('ROUTER_PASSWORD', ''),
  port: 22
};

const conn = new Client();
let stdout = "";
let state = "INIT";

conn.on('ready', () => {
  console.log('READY');
  conn.shell((err, stream) => {
    if (err) throw err;
    stream.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      console.log('RECV[' + state + ']:', JSON.stringify(chunk));
      
      if (chunk.includes('Login:')) {
        console.log('SENDING USERNAME');
        state = 'SENT_USER';
        stream.write(config.username + '\n');
      } else if (chunk.includes('Password:')) {
        console.log('SENDING PASSWORD');
        state = 'SENT_PASS';
        stream.write(config.password + '\n');
      } else if (state === 'SENT_PASS' && (chunk.includes('>') || chunk.includes('#') || chunk.includes('$'))) {
        console.log('DETECTED PROMPT, SENDING COMMAND');
        state = 'SENT_COMMAND';
        stdout = "";
        stream.write('display ipv6 neighbor\n');
      }
    });
    
    setTimeout(() => {
        console.log('FORCING NEWLINE');
        stream.write('\n');
    }, 2000);

    setTimeout(() => {
      console.log('EXITING');
      console.log('FINAL STDOUT:', JSON.stringify(stdout));
      conn.end();
    }, 25000);
  });
}).connect(config);
