import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';

import {
  listAllPorts,
  getPortDetail,
  findPortByName,
  findPortsByDomain,
  getAllProxies,
  searchProxies,
  getPortStats,
  findSubRuleByName,
  smartCreateOrAddProxy,
  smartAddOrUpdateSubRule
} from '../modules/lucky-manager/lucky-port-manager.mjs';

let originalHttpRequest;
let originalHttpsRequest;
let requestLog = [];
let mockState;

function createRawSubRule({
  key,
  remark,
  type = 'reverseproxy',
  domains = [],
  locations = [],
  enable = true,
  advanced = {}
}) {
  return {
    Enable: enable,
    Key: key,
    GroupKey: '',
    Remark: remark,
    WebServiceType: type,
    Domains: domains,
    Locations: locations,
    LocationInsecureSkipVerify: advanced.ignoreTlsVerify ?? true,
    EnableAccessLog: advanced.accessLog ?? true,
    CorazaWAFInstance: advanced.waf ? 'default' : '',
    EasyLucky: advanced.securityPresets ?? true,
    OtherParams: {
      ProxyProtocolV2: true,
      UseTargetHost: advanced.useTargetHost ?? false,
      WebAuth: Boolean(advanced.authentication?.enabled && advanced.authentication?.type === 'web')
    }
  };
}

function createRawRule({
  key,
  name,
  port,
  network = 'tcp6',
  listenIP = '',
  enable = true,
  enableTLS = false,
  proxyList = []
}) {
  return {
    RuleKey: key,
    RuleName: name,
    Network: network,
    ListenIP: listenIP,
    ListenPort: port,
    EnableTLS: enableTLS,
    Enable: enable,
    DefaultProxy: { Key: 'default' },
    ProxyList: proxyList
  };
}

function createBaseRules() {
  return [
    createRawRule({
      key: 'rule-55000',
      name: 'Lucky HTTPS',
      port: 55000,
      network: 'tcp6',
      enableTLS: true,
      proxyList: [
        createRawSubRule({
          key: 'sub-app',
          remark: 'App Service',
          domains: ['app.leecaiy.shop'],
          locations: ['http://192.168.9.10:3000'],
          advanced: {
            ignoreTlsVerify: true,
            accessLog: true,
            useTargetHost: true,
            securityPresets: true
          }
        }),
        createRawSubRule({
          key: 'sub-jump',
          remark: 'Jump Redirect',
          type: 'redirect',
          domains: ['go.leecaiy.shop'],
          locations: ['https://docs.example.test']
        })
      ]
    }),
    createRawRule({
      key: 'rule-8080',
      name: 'Legacy Panel',
      port: 8080,
      network: 'tcp4',
      enable: false,
      proxyList: [
        createRawSubRule({
          key: 'sub-nas',
          remark: 'NAS',
          domains: ['nas.leecaiy.shop'],
          locations: ['http://192.168.9.200:5000'],
          enable: false
        }),
        createRawSubRule({
          key: 'sub-files',
          remark: 'Static Files',
          type: 'fileserver',
          domains: ['files.leecaiy.shop'],
          locations: ['/mnt/files']
        })
      ]
    }),
    createRawRule({
      key: 'rule-50000',
      name: 'Lucky Admin',
      port: 50000,
      network: 'tcp',
      proxyList: []
    })
  ];
}

function installLuckyMock({ ruleList = createBaseRules(), createResponses = [] } = {}) {
  originalHttpRequest = http.request;
  originalHttpsRequest = https.request;
  requestLog = [];
  let createSequence = 100;

  mockState = {
    ruleList: structuredClone(ruleList),
    createResponses: [...createResponses]
  };

  const createRequest = (protocol) => (opts, cb) => {
    const call = {
      protocol,
      opts,
      body: ''
    };
    requestLog.push(call);

    const req = {
      on: () => req,
      setTimeout: () => {},
      destroy: () => {},
      write: (chunk) => {
        call.body += chunk;
      },
      end: () => {
        const { method = 'GET', path = '/' } = call.opts;
        const cleanPath = path.split('?')[0];
        let responseBody;

        if (method === 'GET' && cleanPath.startsWith('/api/webservice/rules')) {
          responseBody = { ret: 0, ruleList: mockState.ruleList };
        } else if (method === 'POST' && cleanPath.startsWith('/api/webservice/rules')) {
          const payload = JSON.parse(call.body || '{}');
          const forced = mockState.createResponses.shift();

          if (forced) {
            responseBody = forced;
            if (forced.ret === 0 && forced.data?.ruleKey) {
              mockState.ruleList.push({
                ...createRawRule({
                  key: forced.data.ruleKey,
                  name: payload.RuleName,
                  port: payload.ListenPort,
                  network: payload.Network,
                  listenIP: payload.ListenIP,
                  enable: payload.Enable,
                  enableTLS: payload.EnableTLS,
                  proxyList: payload.ProxyList || []
                }),
                ...payload
              });
            }
          } else {
            const ruleKey = `rule-${createSequence++}`;
            mockState.ruleList.push({
              ...createRawRule({
                key: ruleKey,
                name: payload.RuleName,
                port: payload.ListenPort,
                network: payload.Network,
                listenIP: payload.ListenIP,
                enable: payload.Enable,
                enableTLS: payload.EnableTLS,
                proxyList: payload.ProxyList || []
              }),
              ...payload,
              RuleKey: ruleKey,
              ProxyList: payload.ProxyList || []
            });
            responseBody = { ret: 0, msg: 'created', data: { ruleKey } };
          }
        } else if (method === 'PUT' && cleanPath.startsWith('/api/webservice/rule/')) {
          const payload = JSON.parse(call.body || '{}');
          const ruleKey = cleanPath.split('/').pop();
          const index = mockState.ruleList.findIndex((rule) => rule.RuleKey === ruleKey);
          if (index >= 0) {
            mockState.ruleList[index] = {
              ...mockState.ruleList[index],
              ...payload,
              RuleKey: ruleKey,
              ProxyList: payload.ProxyList || []
            };
            responseBody = { ret: 0, msg: 'updated' };
          } else {
            responseBody = { ret: -1, msg: 'missing rule' };
          }
        } else if (method === 'DELETE' && cleanPath.startsWith('/api/webservice/rule/')) {
          const ruleKey = cleanPath.split('/').pop();
          mockState.ruleList = mockState.ruleList.filter((rule) => rule.RuleKey !== ruleKey);
          responseBody = { ret: 0, msg: 'deleted' };
        } else {
          responseBody = { ret: -1, msg: `Unhandled ${method} ${path}` };
        }

        const payload = JSON.stringify(responseBody);
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

  http.request = createRequest('http:');
  https.request = createRequest('https:');
}

function restoreLuckyMock() {
  http.request = originalHttpRequest;
  https.request = originalHttpsRequest;
}

describe('lucky-port-manager', () => {
  beforeEach(() => {
    installLuckyMock();
  });

  afterEach(() => {
    restoreLuckyMock();
  });

  it('listAllPorts maps raw Lucky rules to normalized port info', async () => {
    const ports = await listAllPorts({ apiBase: 'http://lucky.local:16601', openToken: 'tok' });

    assert.equal(ports.length, 3);
    assert.deepEqual(ports[0], {
      key: 'rule-55000',
      name: 'Lucky HTTPS',
      port: 55000,
      network: 'tcp6',
      ip: '所有地址',
      tls: true,
      enabled: true,
      subRuleCount: 2,
      subRules: [
        {
          key: 'sub-app',
          name: 'App Service',
          type: 'reverseproxy',
          domains: ['app.leecaiy.shop'],
          targets: ['http://192.168.9.10:3000'],
          enabled: true,
          rawAdvanced: {
            LocationInsecureSkipVerify: true,
            EnableAccessLog: true,
            CorazaWAFInstance: '',
            EasyLucky: true,
            OtherParams: {
              ProxyProtocolV2: true,
              UseTargetHost: true,
              WebAuth: false
            }
          }
        },
        {
          key: 'sub-jump',
          name: 'Jump Redirect',
          type: 'redirect',
          domains: ['go.leecaiy.shop'],
          targets: ['https://docs.example.test'],
          enabled: true,
          rawAdvanced: {
            LocationInsecureSkipVerify: true,
            EnableAccessLog: true,
            CorazaWAFInstance: '',
            EasyLucky: true,
            OtherParams: {
              ProxyProtocolV2: true,
              UseTargetHost: false,
              WebAuth: false
            }
          }
        }
      ]
    });
    assert.match(requestLog[0].opts.path, /openToken=tok/);
  });

  it('lookup helpers find ports and domains from normalized data', async () => {
    const port = await getPortDetail(8080, { apiBase: 'http://lucky.local:16601', openToken: 'tok' });
    const byName = await findPortByName('Lucky Admin', { apiBase: 'http://lucky.local:16601', openToken: 'tok' });
    const byDomain = await findPortsByDomain('nas.leecaiy.shop', { apiBase: 'http://lucky.local:16601', openToken: 'tok' });

    assert.equal(port?.name, 'Legacy Panel');
    assert.equal(byName?.port, 50000);
    assert.equal(byDomain.length, 1);
    assert.equal(byDomain[0].port, 8080);
  });

  it('getAllProxies, searchProxies and getPortStats flatten and summarize rule data', async () => {
    const proxies = await getAllProxies({ apiBase: 'http://lucky.local:16601', openToken: 'tok' });
    const foundByDomain = await searchProxies('nas.leecaiy.shop', { apiBase: 'http://lucky.local:16601', openToken: 'tok' });
    const foundByPortName = await searchProxies('legacy', { apiBase: 'http://lucky.local:16601', openToken: 'tok' });
    const stats = await getPortStats({ apiBase: 'http://lucky.local:16601', openToken: 'tok' });

    assert.equal(proxies.length, 2);
    assert.deepEqual(proxies[0], {
      port: 55000,
      portName: 'Lucky HTTPS',
      ruleKey: 'rule-55000',
      network: 'tcp6',
      enableTLS: true,
      remark: 'App Service',
      domains: ['app.leecaiy.shop'],
      target: 'http://192.168.9.10:3000',
      enabled: true,
      rawAdvanced: {
        LocationInsecureSkipVerify: true,
        EnableAccessLog: true,
        CorazaWAFInstance: '',
        EasyLucky: true,
        OtherParams: {
          ProxyProtocolV2: true,
          UseTargetHost: true,
          WebAuth: false
        }
      }
    });
    assert.equal(foundByDomain.length, 1);
    assert.equal(foundByDomain[0].remark, 'NAS');
    assert.equal(foundByPortName.length, 1);
    assert.equal(foundByPortName[0].port, 8080);
    assert.deepEqual(stats, {
      totalPorts: 3,
      enabledPorts: 2,
      disabledPorts: 1,
      totalSubRules: 4,
      byNetwork: {
        tcp4: 1,
        tcp6: 1,
        tcp: 1
      },
      byType: {
        reverseproxy: 2,
        redirect: 1,
        fileserver: 1
      }
    });
  });

  it('findSubRuleByName returns matching subrule or null', () => {
    const portInfo = {
      subRules: [
        { name: 'App Service', domains: ['app.leecaiy.shop'] },
        { name: 'NAS', domains: ['nas.leecaiy.shop'] }
      ]
    };

    assert.deepEqual(findSubRuleByName(portInfo, 'NAS'), {
      name: 'NAS',
      domains: ['nas.leecaiy.shop']
    });
    assert.equal(findSubRuleByName(portInfo, 'Missing'), null);
    assert.equal(findSubRuleByName({}, 'NAS'), null);
  });

  it('smartCreateOrAddProxy returns port_exists when target port already exists', async () => {
    const result = await smartCreateOrAddProxy(
      55000,
      'App Service',
      'app.leecaiy.shop',
      'http://192.168.9.10:3000',
      {},
      { apiBase: 'http://lucky.local:16601', openToken: 'tok' }
    );

    assert.equal(result.action, 'port_exists');
    assert.equal(result.ret, -2);
    assert.equal(result.portInfo?.name, 'Lucky HTTPS');
  });

  it('smartCreateOrAddProxy returns create_no_key when Lucky omits ruleKey', async () => {
    restoreLuckyMock();
    installLuckyMock({
      ruleList: createBaseRules(),
      createResponses: [{ ret: 0, msg: 'created without key' }]
    });

    const result = await smartCreateOrAddProxy(
      50010,
      'New Proxy',
      'new.leecaiy.shop',
      'http://192.168.9.10:50010',
      {},
      { apiBase: 'http://lucky.local:16601', openToken: 'tok' }
    );

    assert.deepEqual(result, {
      ret: -1,
      msg: '创建端口成功但无法查询到新端口',
      action: 'create_no_query'
    });
  });

  it('smartCreateOrAddProxy creates a port then appends reverse proxy subrule', async () => {
    const result = await smartCreateOrAddProxy(
      50010,
      'New Proxy',
      'new.leecaiy.shop',
      'http://192.168.9.10:50010',
      { network: 'tcp6', enableTLS: true },
      { apiBase: 'http://lucky.local:16601', openToken: 'tok' }
    );

    assert.equal(result.ret, 0);
    assert.equal(result.action, 'created');

    const createdRule = mockState.ruleList.find((rule) => rule.ListenPort === 50010);
    assert.ok(createdRule);
    assert.equal(createdRule.EnableTLS, true);
    assert.equal(createdRule.ProxyList.length, 1);
    assert.equal(createdRule.ProxyList[0].Remark, 'New Proxy');
    assert.deepEqual(createdRule.ProxyList[0].Domains, ['new.leecaiy.shop']);
    assert.deepEqual(createdRule.ProxyList[0].Locations, ['http://192.168.9.10:50010']);
  });

  it('smartAddOrUpdateSubRule returns port_not_found when Lucky rule is missing', async () => {
    const result = await smartAddOrUpdateSubRule(
      12345,
      'Ghost Rule',
      'reverseproxy',
      ['ghost.leecaiy.shop'],
      ['http://192.168.9.123:12345'],
      {},
      { apiBase: 'http://lucky.local:16601', openToken: 'tok' }
    );

    assert.deepEqual(result, {
      ret: -1,
      msg: '端口 12345 的原始规则不存在',
      action: 'port_not_found'
    });
  });

  it('smartAddOrUpdateSubRule adds a new subrule when remark does not exist', async () => {
    const result = await smartAddOrUpdateSubRule(
      50000,
      'Admin Console',
      'reverseproxy',
      ['admin.leecaiy.shop'],
      ['http://192.168.9.2:16601'],
      {
        advanced: {
          useTargetHost: true,
          authentication: {
            enabled: true,
            type: 'web'
          }
        }
      },
      { apiBase: 'http://lucky.local:16601', openToken: 'tok' }
    );

    assert.equal(result.ret, 0);
    assert.equal(result.action, 'added');

    const updatedRule = mockState.ruleList.find((rule) => rule.ListenPort === 50000);
    assert.equal(updatedRule.ProxyList.length, 1);
    assert.equal(updatedRule.ProxyList[0].Remark, 'Admin Console');
    assert.deepEqual(updatedRule.ProxyList[0].Domains, ['admin.leecaiy.shop']);
    assert.equal(updatedRule.ProxyList[0].OtherParams.UseTargetHost, true);
    assert.equal(updatedRule.ProxyList[0].OtherParams.WebAuth, true);
  });

  it('smartAddOrUpdateSubRule updates an existing subrule in place', async () => {
    const result = await smartAddOrUpdateSubRule(
      55000,
      'App Service',
      'reverseproxy',
      ['app.leecaiy.shop', 'api.leecaiy.shop'],
      ['https://192.168.9.10:3443'],
      {
        enable: false,
        advanced: {
          ignoreTlsVerify: false,
          accessLog: false,
          waf: true,
          securityPresets: false,
          useTargetHost: false,
          authentication: {
            enabled: true,
            type: 'basic'
          }
        }
      },
      { apiBase: 'http://lucky.local:16601', openToken: 'tok' }
    );

    assert.equal(result.ret, 0);
    assert.equal(result.action, 'updated');
    assert.equal(result.data.port, 55000);

    const updatedRule = mockState.ruleList.find((rule) => rule.ListenPort === 55000);
    const updatedSubRule = updatedRule.ProxyList.find((sub) => sub.Remark === 'App Service');
    assert.deepEqual(updatedSubRule.Domains, ['app.leecaiy.shop', 'api.leecaiy.shop']);
    assert.deepEqual(updatedSubRule.Locations, ['https://192.168.9.10:3443']);
    assert.equal(updatedSubRule.Enable, false);
    assert.equal(updatedSubRule.LocationInsecureSkipVerify, false);
    assert.equal(updatedSubRule.EnableAccessLog, false);
    assert.equal(updatedSubRule.CorazaWAFInstance, 'default');
    assert.equal(updatedSubRule.SafeIPMode, 'none');
    assert.equal(updatedSubRule.SafeUserAgentMode, 'none');
    assert.equal(updatedSubRule.EasyLucky, false);
    assert.equal(updatedSubRule.OtherParams.UseTargetHost, true);
    assert.equal(updatedSubRule.OtherParams.WebAuth, false);
  });
});
