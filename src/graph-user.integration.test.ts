import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearEntraIdCache,
  findTeamsUserByThaiName,
  setGraphClientForTesting,
} from './graph-user.js';

class MockGraphClient {
  constructor(private readonly users: unknown[]) {}

  public lastApiPath = '';
  public lastFilter = '';
  public lastSelect: string[] = [];
  public lastTop = 0;

  api(path: string): this {
    this.lastApiPath = path;
    return this;
  }

  filter(value: string): this {
    this.lastFilter = value;
    return this;
  }

  select(fields: string[]): this {
    this.lastSelect = fields;
    return this;
  }

  top(value: number): this {
    this.lastTop = value;
    return this;
  }

  async get(): Promise<{ value: unknown[] }> {
    return { value: this.users };
  }
}

function configureTestCredentials(): void {
  process.env.AZURE_TENANT_ID = 'tenant-test';
  process.env.AZURE_CLIENT_ID = 'client-test';
  process.env.AZURE_CLIENT_SECRET = 'secret-test';
}

test('findTeamsUserByThaiName returns duplicate matches with normalized phones', async () => {
  clearEntraIdCache();
  configureTestCredentials();

  const mock = new MockGraphClient([
    {
      displayName: 'Vichya Sripibaln',
      userPrincipalName: 'vichya.s@wbgood.cloud',
      businessPhones: ['tel:+668101000'],
      mobilePhone: null,
    },
    {
      displayName: 'Vichya Nttvoice',
      userPrincipalName: 'vichyantt@wbgood.cloud',
      businessPhones: ['+66 8101001'],
      mobilePhone: null,
    },
  ]);

  setGraphClientForTesting(mock as never);

  const result = await findTeamsUserByThaiName('Vichya');

  assert.equal(result.isDuplicate, true);
  assert.equal(result.transferTarget, null);
  assert.equal(result.matches.length, 2);
  assert.equal(result.matches[0]?.phoneNumber, '+668101000');
  assert.equal(result.matches[1]?.phoneNumber, '+668101001');

  assert.equal(mock.lastApiPath, '/users');
  assert.equal(mock.lastFilter.includes("startswith(displayName, 'Vichya')"), true);
  assert.equal(mock.lastFilter.includes("startswith(userPrincipalName, 'Vichya')"), true);
  assert.equal(mock.lastFilter.includes("startswith(givenName, 'Vichya')"), true);
  assert.equal(mock.lastFilter.includes("startswith(surname, 'Vichya')"), true);
  assert.equal(mock.lastTop, 10);
});

test('findTeamsUserByThaiName returns match without transfer target when phone is missing', async () => {
  clearEntraIdCache();
  configureTestCredentials();

  const mock = new MockGraphClient([
    {
      displayName: 'Uthai Dangthong',
      userPrincipalName: 'uthai.t@wbgood.cloud',
      businessPhones: [],
      mobilePhone: null,
    },
  ]);

  setGraphClientForTesting(mock as never);

  const result = await findTeamsUserByThaiName('อุทัย');

  assert.equal(result.isDuplicate, false);
  assert.equal(result.upn, 'uthai.t@wbgood.cloud');
  assert.equal(result.phoneNumber, null);
  assert.equal(result.transferTarget, null);
  assert.equal(result.matches.length, 1);
});
