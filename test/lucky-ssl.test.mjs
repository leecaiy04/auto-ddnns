import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';

import {
  getSSLInfo,
  applyACMECert,
  renewCert,
  deleteCert,
  isCertExpiringSoon,
  getCertExpiryInfo,
  listExpiringSoonCerts
} from '../modules/lucky-manager/lucky-ssl.mjs';

let originalHttpRequest;
let originalHttpsRequest;
let requestResolver;
let requestLog = [];

function installRequestMock() {
  originalHttpRequest = http.request;
  originalHttpsRequest = https.request;
  requestLog = [];
  requestResolver = () => ({ ret: 0, list: [] });

  const createMockRequest = (protocol) => (opts, cb) => {
    const call = { protocol, opts, body: '' };
    requestLog.push(call);

    const req = {
      on: () => req,
      setTimeout: () => {},
      destroy: () => {},
      write: (chunk) => {
        call.body += chunk;
      },
      end: () => {
        const payload = JSON.stringify(requestResolver(call));
        const res = {
          statusCode: 200,
          statusMessage: 'OK',
          on: (event, handler) => {
            if (event === 'data') {
              setImmediate(() => handler(payload));
            }
            if (event === 'end') {
              setImmediate(() => handler());
            }
          }
        };

        setImmediate(() => cb(res));
      }
    };

    return req;
  };

  http.request = createMockRequest('http:');
  https.request = createMockRequest('https:');
}

function restoreRequestMock() {
  http.request = originalHttpRequest;
  https.request = originalHttpsRequest;
}

function buildCert({ key, remark, daysUntilExpiry, domains = ['app.leecaiy.shop'] }) {
  return {
    Key: key,
    Remark: remark,
    Enable: true,
    AddFrom: 'acme',
    CertsInfo: daysUntilExpiry === null
      ? {}
      : {
          Domains: domains,
          NotAfterTime: new Date(Date.now() + daysUntilExpiry * 24 * 60 * 60 * 1000).toISOString()
        }
  };
}

describe('lucky-ssl', () => {
  beforeEach(() => {
    installRequestMock();
  });

  afterEach(() => {
    restoreRequestMock();
  });

  it('getSSLInfo returns matching certificate from SSL list', async () => {
    requestResolver = () => ({
      ret: 0,
      list: [
        buildCert({ key: 'cert-1', remark: 'Primary cert', daysUntilExpiry: 45 }),
        buildCert({ key: 'cert-2', remark: 'Backup cert', daysUntilExpiry: 10 })
      ]
    });

    const cert = await getSSLInfo('cert-2', {
      apiBase: 'http://lucky.local:16601',
      openToken: 'open-token'
    });

    assert.equal(cert.Key, 'cert-2');
    assert.equal(cert.Remark, 'Backup cert');
    assert.equal(requestLog.length, 1);
    assert.equal(requestLog[0].opts.hostname, 'lucky.local');
    assert.match(requestLog[0].opts.path, /\/api\/ssl\?openToken=open-token/);
  });

  it('getSSLInfo throws when Lucky API returns error', async () => {
    requestResolver = () => ({ ret: -1, msg: 'api failed' });

    await assert.rejects(
      () => getSSLInfo('cert-x', { apiBase: 'http://lucky.local:16601', openToken: 'tok' }),
      { message: /获取证书列表失败: api failed/ }
    );
  });

  it('getSSLInfo throws when certificate does not exist', async () => {
    requestResolver = () => ({
      ret: 0,
      list: [buildCert({ key: 'cert-1', remark: 'Primary cert', daysUntilExpiry: 45 })]
    });

    await assert.rejects(
      () => getSSLInfo('missing-cert', { apiBase: 'http://lucky.local:16601', openToken: 'tok' }),
      { message: /证书 missing-cert 不存在/ }
    );
  });

  it('applyACMECert sends default ACME fields and DNS credentials', async () => {
    requestResolver = () => ({ ret: 0, msg: 'ok' });

    await applyACMECert({
      remark: 'Wildcard cert',
      domains: ['*.leecaiy.shop', 'leecaiy.shop'],
      email: 'ops@example.test',
      dnsProvider: 'alidns',
      dnsId: 'ak',
      dnsSecret: 'sk'
    }, {
      apiBase: 'http://lucky.local:16601',
      openToken: 'tok'
    });

    assert.equal(requestLog.length, 1);
    assert.match(requestLog[0].opts.path, /\/api\/ssl\/apply\?openToken=tok/);
    const body = JSON.parse(requestLog[0].body);
    assert.equal(body.Remark, 'Wildcard cert');
    assert.equal(body.Enable, true);
    assert.equal(body.AddFrom, 'acme');
    assert.equal(body.ExtParams.acmeCADirURL, 'https://acme-v02.api.letsencrypt.org/directory');
    assert.equal(body.ExtParams.acmeDNSServer, 'alidns');
    assert.equal(body.ExtParams.acmeDNSID, 'ak');
    assert.equal(body.ExtParams.acmeDNSSecret, 'sk');
    assert.equal(body.ExtParams.acmeEmail, 'ops@example.test');
    assert.equal(body.ExtParams.acmeKeyType, '2048');
    assert.equal(body.ExtParams.acmeCNAMESupport, true);
    assert.deepEqual(body.ExtParams.acmeDomains, ['*.leecaiy.shop', 'leecaiy.shop']);
  });

  it('renewCert and deleteCert send Key payloads to Lucky endpoints', async () => {
    requestResolver = () => ({ ret: 0, msg: 'ok' });

    await renewCert('cert-renew', { apiBase: 'http://lucky.local:16601', openToken: 'tok' });
    await deleteCert('cert-delete', { apiBase: 'http://lucky.local:16601', openToken: 'tok' });

    assert.equal(requestLog.length, 2);
    assert.match(requestLog[0].opts.path, /\/api\/ssl\/renew\?openToken=tok/);
    assert.deepEqual(JSON.parse(requestLog[0].body), { Key: 'cert-renew' });
    assert.match(requestLog[1].opts.path, /\/api\/ssl\/delete\?openToken=tok/);
    assert.deepEqual(JSON.parse(requestLog[1].body), { Key: 'cert-delete' });
  });

  it('expiry helpers compute days and expiring-soon flags', async () => {
    requestResolver = () => ({
      ret: 0,
      list: [buildCert({ key: 'cert-soon', remark: 'Soon expiring', daysUntilExpiry: 5 })]
    });

    const expiringSoon = await isCertExpiringSoon('cert-soon', 30, {
      apiBase: 'http://lucky.local:16601',
      openToken: 'tok'
    });
    const info = await getCertExpiryInfo('cert-soon', {
      apiBase: 'http://lucky.local:16601',
      openToken: 'tok'
    });

    assert.equal(expiringSoon, true);
    assert.equal(info.certKey, 'cert-soon');
    assert.equal(info.remark, 'Soon expiring');
    assert.equal(info.isExpired, false);
    assert.equal(info.isExpiringSoon, true);
    assert.ok(info.daysUntilExpiry <= 5);
    assert.ok(info.daysUntilExpiry >= 4);
  });

  it('getCertExpiryInfo throws when certificate expiry data is missing', async () => {
    requestResolver = () => ({
      ret: 0,
      list: [buildCert({ key: 'broken-cert', remark: 'Broken cert', daysUntilExpiry: null })]
    });

    await assert.rejects(
      () => getCertExpiryInfo('broken-cert', { apiBase: 'http://lucky.local:16601', openToken: 'tok' }),
      { message: /证书信息不完整/ }
    );
  });

  it('listExpiringSoonCerts filters by threshold and skips incomplete certs', async () => {
    requestResolver = () => ({
      ret: 0,
      list: [
        buildCert({ key: 'cert-soon', remark: 'Soon expiring', daysUntilExpiry: 3, domains: ['soon.leecaiy.shop'] }),
        buildCert({ key: 'cert-later', remark: 'Later expiring', daysUntilExpiry: 50, domains: ['later.leecaiy.shop'] }),
        buildCert({ key: 'cert-missing', remark: 'Missing expiry', daysUntilExpiry: null, domains: ['missing.leecaiy.shop'] })
      ]
    });

    const expiring = await listExpiringSoonCerts(30, {
      apiBase: 'http://lucky.local:16601',
      openToken: 'tok'
    });

    assert.equal(expiring.length, 1);
    assert.equal(expiring[0].certKey, 'cert-soon');
    assert.equal(expiring[0].remark, 'Soon expiring');
    assert.deepEqual(expiring[0].domains, ['soon.leecaiy.shop']);
    assert.ok(expiring[0].daysUntilExpiry <= 3);
    assert.ok(expiring[0].daysUntilExpiry >= 2);
  });
});
