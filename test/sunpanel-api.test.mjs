import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSunPanelAuthConfig,
  getGroupList,
  createGroup,
  getItemInfo,
  updateItem,
  createItem
} from '../lib/api-clients/sunpanel-api.mjs';

// Track fetch calls
let fetchCalls = [];
let originalFetch = globalThis.fetch;

function mockFetch(responses) {
  fetchCalls = [];
  let callIndex = 0;

  globalThis.fetch = async (url, options) => {
    const entry = responses[callIndex] || responses[responses.length - 1];
    const call = { url, options: { ...options } };
    fetchCalls.push(call);
    callIndex++;

    return {
      json: async () => entry
    };
  };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

describe('sunpanel-api', () => {
  beforeEach(() => {
    mockFetch([
      { code: 0, msg: 'success', data: { list: [], count: 0 } }
    ]);
  });

  afterEach(() => {
    restoreFetch();
  });

  it('getSunPanelAuthConfig reports auth status correctly', () => {
    const withToken = getSunPanelAuthConfig({ apiToken: 'tok', apiBase: 'http://a' });
    assert.equal(withToken.hasToken, true);
    assert.equal(withToken.apiBase, 'http://a');

    const withoutToken = getSunPanelAuthConfig({ apiToken: '', apiBase: 'http://b' });
    assert.equal(withoutToken.hasToken, false);
  });

  it('normalizes trailing slashes from apiBase via getSunPanelAuthConfig', () => {
    const config = getSunPanelAuthConfig({ apiBase: 'http://sunpanel:20001/openapi/v1/' });
    assert.equal(config.apiBase, 'http://sunpanel:20001/openapi/v1');
  });

  it('passes explicit config into API calls', async () => {
    mockFetch([
      { code: 0, msg: 'success', data: { list: [{ itemGroupID: 1, onlyName: 'nas' }], count: 1 } }
    ]);

    const instanceConfig = {
      apiBase: 'http://sunpanel-instance.local/openapi/v1',
      apiToken: 'instance-token'
    };

    const result = await getGroupList(instanceConfig);

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, 'http://sunpanel-instance.local/openapi/v1/itemGroup/getList');
    assert.equal(fetchCalls[0].options.headers.token, 'instance-token');
    assert.equal(result.count, 1);
  });

  it('createGroup passes config to callApi', async () => {
    mockFetch([
      { code: 0, msg: 'success', data: { itemGroupID: 5 } }
    ]);

    const config = { apiBase: 'http://sp:20001/openapi/v1', apiToken: 't' };
    await createGroup({ title: 'Test', onlyName: 'test' }, config);

    assert.equal(fetchCalls[0].url, 'http://sp:20001/openapi/v1/itemGroup/create');
    const body = JSON.parse(fetchCalls[0].options.body);
    assert.equal(body.title, 'Test');
    assert.equal(body.onlyName, 'test');
  });

  it('getItemInfo passes config to callApi', async () => {
    mockFetch([
      { code: 0, msg: 'success', data: { title: 'Card', onlyName: 'svc-1' } }
    ]);

    const config = { apiBase: 'http://sp:20001/openapi/v1', apiToken: 't' };
    await getItemInfo('svc-1', config);

    assert.equal(fetchCalls[0].url, 'http://sp:20001/openapi/v1/item/getInfoByOnlyName');
    const body = JSON.parse(fetchCalls[0].options.body);
    assert.equal(body.onlyName, 'svc-1');
  });

  it('updateItem passes config to callApi', async () => {
    mockFetch([
      { code: 0, msg: 'success', data: null }
    ]);

    const config = { apiBase: 'http://sp:20001/openapi/v1', apiToken: 't' };
    await updateItem({
      onlyName: 'svc-1',
      title: 'Updated Title',
      url: 'https://example.com'
    }, config);

    assert.equal(fetchCalls[0].url, 'http://sp:20001/openapi/v1/item/update');
    assert.equal(fetchCalls[0].options.headers.token, 't');
    const body = JSON.parse(fetchCalls[0].options.body);
    assert.equal(body.onlyName, 'svc-1');
    assert.equal(body.title, 'Updated Title');
    assert.equal(body.url, 'https://example.com');
  });

  it('createItem passes config to callApi', async () => {
    mockFetch([
      { code: 0, msg: 'success', data: null }
    ]);

    const config = { apiBase: 'http://sp:20001/openapi/v1', apiToken: 't' };
    await createItem({
      title: 'New Card',
      url: 'https://example.com',
      onlyName: 'svc-2',
      itemGroupID: 1
    }, config);

    assert.equal(fetchCalls[0].url, 'http://sp:20001/openapi/v1/item/create');
    assert.equal(fetchCalls[0].options.headers.token, 't');
  });
});
