import assert from 'node:assert/strict';
import test from 'node:test';

import { LuckyManager } from '../central-hub/modules/lucky-manager.mjs';

test('LuckyManager defaults lucky apiBase to /666 endpoint', () => {
  const previous = process.env.LUCKY_API_BASE;

  try {
    delete process.env.LUCKY_API_BASE;

    const manager = new LuckyManager({}, { state: {} }, null);
    assert.equal(manager.luckyConfig.apiBase, 'http://192.168.3.2:16601/666');
  } finally {
    if (previous === undefined) delete process.env.LUCKY_API_BASE;
    else process.env.LUCKY_API_BASE = previous;
  }
});

test('ensureManagedDomainCertificates skips when sslCertDomains is empty', async () => {
  const manager = new LuckyManager({}, { state: {} }, null);

  const result = await manager.ensureManagedDomainCertificates({ dns: { sslCertDomains: [] } });

  assert.equal(result.success, 0);
  assert.equal(result.failed, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.details[0].reason, 'no_ssl_cert_domains');
});

test('ensureManagedDomainCertificates applies certs when target domain is not covered', async () => {
  const prevEmail = process.env.LUCKY_ACME_EMAIL;
  const prevAk = process.env.ALIYUN_AK;
  const prevSk = process.env.ALIYUN_SK;

  process.env.LUCKY_ACME_EMAIL = 'ops@example.com';
  process.env.ALIYUN_AK = 'ak-test';
  process.env.ALIYUN_SK = 'sk-test';

  try {
    const manager = new LuckyManager({}, { state: {} }, null);
    let appliedDomains = null;

    manager.sslApi = {
      getSSLList: async () => ({ ret: 0, list: [{ CertsInfo: { Domains: ['existing.example.com'] } }] }),
      applyACMECert: async ({ domains }) => {
        appliedDomains = domains;
        return { ret: 0, msg: 'ok' };
      }
    };

    const result = await manager.ensureManagedDomainCertificates({
      dns: { sslCertDomains: ['new.example.com'] }
    });

    assert.equal(result.failed, 0);
    assert.equal(result.success, 1);
    assert.deepEqual(appliedDomains, ['new.example.com']);
    assert.equal(result.details[0].action, 'applied');
  } finally {
    if (prevEmail === undefined) delete process.env.LUCKY_ACME_EMAIL;
    else process.env.LUCKY_ACME_EMAIL = prevEmail;

    if (prevAk === undefined) delete process.env.ALIYUN_AK;
    else process.env.ALIYUN_AK = prevAk;

    if (prevSk === undefined) delete process.env.ALIYUN_SK;
    else process.env.ALIYUN_SK = prevSk;
  }
});

test('ensureManagedDomainCertificates skips apply when wildcard cert already covers domain', async () => {
  const prevEmail = process.env.LUCKY_ACME_EMAIL;
  const prevAk = process.env.ALIYUN_AK;
  const prevSk = process.env.ALIYUN_SK;

  process.env.LUCKY_ACME_EMAIL = 'ops@example.com';
  process.env.ALIYUN_AK = 'ak-test';
  process.env.ALIYUN_SK = 'sk-test';

  try {
    const manager = new LuckyManager({}, { state: {} }, null);
    let applyCalled = false;

    manager.sslApi = {
      getSSLList: async () => ({ ret: 0, list: [{ CertsInfo: { Domains: ['*.example.com'] } }] }),
      applyACMECert: async () => {
        applyCalled = true;
        return { ret: 0 };
      }
    };

    const result = await manager.ensureManagedDomainCertificates({
      dns: { sslCertDomains: ['api.example.com'] }
    });

    assert.equal(result.success, 0);
    assert.equal(result.failed, 0);
    assert.equal(result.skipped, 1);
    assert.equal(applyCalled, false);
    assert.equal(result.details[0].reason, 'already_covered');
  } finally {
    if (prevEmail === undefined) delete process.env.LUCKY_ACME_EMAIL;
    else process.env.LUCKY_ACME_EMAIL = prevEmail;

    if (prevAk === undefined) delete process.env.ALIYUN_AK;
    else process.env.ALIYUN_AK = prevAk;

    if (prevSk === undefined) delete process.env.ALIYUN_SK;
    else process.env.ALIYUN_SK = prevSk;
  }
});

test('ensureManagedDomainCertificates returns missing_credentials when env is incomplete', async () => {
  const prevEmail = process.env.LUCKY_ACME_EMAIL;
  const prevAk = process.env.ALIYUN_AK;
  const prevSk = process.env.ALIYUN_SK;

  delete process.env.LUCKY_ACME_EMAIL;
  process.env.ALIYUN_AK = 'ak-test';
  delete process.env.ALIYUN_SK;

  try {
    const manager = new LuckyManager({}, { state: {} }, null);

    const result = await manager.ensureManagedDomainCertificates({
      dns: { sslCertDomains: ['new.example.com'] }
    });

    assert.equal(result.success, 0);
    assert.equal(result.failed, 1);
    assert.equal(result.error, 'missing_credentials');
    assert.equal(result.details[0].missing.LUCKY_ACME_EMAIL, true);
    assert.equal(result.details[0].missing.ALIYUN_AK, false);
    assert.equal(result.details[0].missing.ALIYUN_SK, true);
  } finally {
    if (prevEmail === undefined) delete process.env.LUCKY_ACME_EMAIL;
    else process.env.LUCKY_ACME_EMAIL = prevEmail;

    if (prevAk === undefined) delete process.env.ALIYUN_AK;
    else process.env.ALIYUN_AK = prevAk;

    if (prevSk === undefined) delete process.env.ALIYUN_SK;
    else process.env.ALIYUN_SK = prevSk;
  }
});
