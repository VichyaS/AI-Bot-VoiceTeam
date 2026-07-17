import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearEntraIdCache,
  findTeamsUserByThaiName,
  setGraphClientForTesting,
} from './graph-user.js';

class MockGraphClient {
  constructor(
    private readonly users: unknown[],
    private readonly pathResponses: Record<string, unknown> = {},
  ) {}

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
    if (this.pathResponses[this.lastApiPath] !== undefined) {
      return this.pathResponses[this.lastApiPath] as never;
    }

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

test('findTeamsUserByThaiName resolves missing phone by querying user detail', async () => {
  clearEntraIdCache();
  configureTestCredentials();

  const upn = 'uthai.t@wbgood.cloud';
  const encodedUpn = encodeURIComponent(upn);
  const mock = new MockGraphClient(
    [
      {
        displayName: 'Uthai Dangthong',
        userPrincipalName: upn,
        businessPhones: [],
        mobilePhone: null,
      },
    ],
    {
      [`/users/${encodedUpn}`]: {
        displayName: 'Uthai Dangthong',
        userPrincipalName: upn,
        businessPhones: ['tel:+668101003'],
        mobilePhone: null,
      },
    },
  );

  setGraphClientForTesting(mock as never);

  const result = await findTeamsUserByThaiName('อุทัย');

  assert.equal(result.isDuplicate, false);
  assert.equal(result.upn, upn);
  assert.equal(result.phoneNumber, '+668101003');
  assert.equal(result.transferTarget, '+668101003');
  assert.equal(result.matches.length, 1);
});

test('findTeamsUserByThaiName resolves 4-digit extension to unique phone transfer target', async () => {
  clearEntraIdCache();
  configureTestCredentials();

  const mock = new MockGraphClient([
    {
      displayName: 'Wiphanee Boonsing',
      userPrincipalName: 'wiphanee.b@wbgood.cloud',
      businessPhones: ['tel:+668101002'],
      mobilePhone: null,
    },
    {
      displayName: 'Yi Kang Goh',
      userPrincipalName: 'kang.goh@wbgood.cloud',
      businessPhones: ['tel:+668101005'],
      mobilePhone: null,
    },
  ]);

  setGraphClientForTesting(mock as never);

  const result = await findTeamsUserByThaiName('1002');

  assert.equal(result.isDuplicate, false);
  assert.equal(result.phoneNumber, '+668101002');
  assert.equal(result.transferTarget, '+668101002');
  assert.equal(result.matches.length, 1);
  assert.equal(mock.lastTop, 200);
});

test('findTeamsUserByThaiName returns duplicate list for 4-digit extension collisions', async () => {
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
      displayName: 'Guest Vichya',
      userPrincipalName: 'guest.vichya@wbgood.cloud',
      businessPhones: ['tel:+669001000'],
      mobilePhone: null,
    },
  ]);

  setGraphClientForTesting(mock as never);

  const result = await findTeamsUserByThaiName('1000');

  assert.equal(result.isDuplicate, true);
  assert.equal(result.transferTarget, null);
  assert.equal(result.matches.length, 2);
  assert.equal(result.matches[0]?.displayName, 'Vichya Sripibaln');
  assert.equal(result.matches[1]?.displayName, 'Guest Vichya');
});

test('findTeamsUserByThaiName matches 4-digit extension from non-first business phone', async () => {
  clearEntraIdCache();
  configureTestCredentials();

  const mock = new MockGraphClient([
    {
      displayName: 'Sothea Hun',
      userPrincipalName: 'sothea.h@wbgood.cloud',
      businessPhones: ['tel:+668101004', 'tel:+669991001'],
      mobilePhone: null,
    },
  ]);

  setGraphClientForTesting(mock as never);

  const result = await findTeamsUserByThaiName('1001');

  assert.equal(result.isDuplicate, false);
  assert.equal(result.phoneNumber, '+669991001');
  assert.equal(result.transferTarget, '+669991001');
});
