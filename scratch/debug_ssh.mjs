import ssh from '../lib/ssh-client.mjs';

async function debug() {
  try {
    console.log('Testing SSH Connection...');
    const result = await ssh.testSSHConnection();
    console.log('Test result:', result);
    
    console.log('Executing "display version"...');
    const out = await ssh.executeSSHCommand('display version');
    console.log('Output length:', out.length);
    console.log('Output:', JSON.stringify(out));
  } catch (err) {
    console.error('DIAG ERROR:', err.message);
  }
}

debug();
