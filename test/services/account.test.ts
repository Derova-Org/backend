/**
 * Unit tests for account service — session management, challenge, and hashing.
 *
 * Mocks external deps (storage, crypto, SDK) so tests run in isolation.
 * Uses Node's built-in test runner + mock.module().
 *
 * Run: node --test --experimental-test-module-mocks --import tsx test/services/account.test.ts
 */

import { describe, it, before, mock } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Mock external dependencies BEFORE importing the service
// ---------------------------------------------------------------------------

const mockAccountExists = mock.fn(async (_hash: string) => false);
const mockCreateAccountRecord = mock.fn(async () => {});
const mockGetAccountRecord = mock.fn(async (_hash: string) => ({
  publicKeyHex: 'aa'.repeat(32),
  accountId: '0.0.12345',
  createdAt: new Date().toISOString(),
}));

mock.module('../../src/storage/index.js', {
  namedExports: {
    accountExists: mockAccountExists,
    createAccountRecord: mockCreateAccountRecord,
    getAccountRecord: mockGetAccountRecord,
  },
});

const mockGetSecrets = mock.fn(async () => ({
  oprfSeed: new Uint8Array(32),
  orgId: 'org-test-123',
}));
const mockDeriveOprfKey = mock.fn((_seed: Uint8Array, _hash: string) => new Uint8Array(32));
const mockOprfEvaluate = mock.fn((_key: Uint8Array, _blinded: string) => 'ee'.repeat(32));

mock.module('../../src/crypto/index.js', {
  namedExports: {
    getSecrets: mockGetSecrets,
    deriveOprfKey: mockDeriveOprfKey,
    oprfEvaluate: mockOprfEvaluate,
  },
});

const mockSdkHashUsername = mock.fn((_raw: string, _key: Uint8Array) => 'hashed_test');
const mockVerifySignature = mock.fn((_sig: Uint8Array, _msg: Uint8Array, _pub: Uint8Array) => true);
const mockRandomBytes = mock.fn((n: number) => new Uint8Array(n).fill(0xab));
const mockBytesToHex = mock.fn((_bytes: Uint8Array) => 'ab'.repeat(32));
const mockHexToBytes = mock.fn((hex: string) => new Uint8Array(hex.length / 2));

mock.module('@derova/sdk', {
  namedExports: {
    hashUsername: mockSdkHashUsername,
    verifySignature: mockVerifySignature,
    randomBytes: mockRandomBytes,
    bytesToHex: mockBytesToHex,
    hexToBytes: mockHexToBytes,
  },
});

mock.module('../../src/logger.js', {
  defaultExport: {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => ({ info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }),
  },
});

// ---------------------------------------------------------------------------
// Import service after mocks are set up
// ---------------------------------------------------------------------------

let service: typeof import('../../src/services/account.js');

before(async () => {
  service = await import('../../src/services/account.js');
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Account service', () => {
  describe('hashUsername', () => {
    it('delegates to SDK hashUsername with HMAC key', () => {
      const result = service.hashUsername('alice');
      assert.equal(result, 'hashed_test');
      assert.equal(mockSdkHashUsername.mock.callCount(), 1);
      const [raw, key] = mockSdkHashUsername.mock.calls[0].arguments;
      assert.equal(raw, 'alice');
      assert.ok(key instanceof Uint8Array);
    });
  });

  describe('createSession / isValidSession', () => {
    it('creates a valid JWT session token', () => {
      const token = service.createSession('hashed_alice');
      assert.equal(typeof token, 'string');
      assert.ok(token.split('.').length === 3, 'should be a JWT with 3 parts');
    });

    it('validates a token it created', () => {
      const token = service.createSession('hashed_alice');
      assert.equal(service.isValidSession(token), true);
    });

    it('rejects a garbage token', () => {
      assert.equal(service.isValidSession('not-a-jwt'), false);
    });

    it('rejects an empty token', () => {
      assert.equal(service.isValidSession(''), false);
    });

    it('rejects a tampered token', () => {
      const token = service.createSession('hashed_alice');
      // Flip a character in the signature portion
      const tampered = token.slice(0, -1) + (token.at(-1) === 'a' ? 'b' : 'a');
      assert.equal(service.isValidSession(tampered), false);
    });
  });

  describe('issueChallenge / consumeChallenge', () => {
    it('issues a challenge and consumes it once', () => {
      const challengeHex = service.issueChallenge('hash_bob');
      assert.equal(typeof challengeHex, 'string');
      assert.ok(challengeHex.length > 0);

      const consumed = service.consumeChallenge('hash_bob');
      assert.equal(consumed, challengeHex);

      // Second consume returns null (already consumed)
      const again = service.consumeChallenge('hash_bob');
      assert.equal(again, null);
    });

    it('returns null for unknown username hash', () => {
      const result = service.consumeChallenge('nonexistent_hash');
      assert.equal(result, null);
    });
  });

  describe('sessionLogout', () => {
    it('executes without error (stateless noop)', () => {
      assert.doesNotThrow(() => service.sessionLogout('some-token'));
    });
  });

  describe('checkAvailability', () => {
    it('returns available: true when account does not exist', async () => {
      mockAccountExists.mock.mockImplementationOnce(async () => false);
      const result = await service.checkAvailability('newuser');
      assert.deepEqual(result, { available: true });
    });

    it('returns available: false when account exists', async () => {
      mockAccountExists.mock.mockImplementationOnce(async () => true);
      const result = await service.checkAvailability('existing');
      assert.deepEqual(result, { available: false });
    });
  });

  describe('evaluateOprf', () => {
    it('returns evaluatedHex and orgId', async () => {
      const result = await service.evaluateOprf('alice', 'aabb');
      assert.ok(result.evaluatedHex);
      assert.equal(result.orgId, 'org-test-123');
      assert.equal(mockGetSecrets.mock.callCount() >= 1, true);
      assert.equal(mockDeriveOprfKey.mock.callCount() >= 1, true);
      assert.equal(mockOprfEvaluate.mock.callCount() >= 1, true);
    });
  });

  describe('completeRegistration', () => {
    it('creates account record and issues challenge', async () => {
      mockAccountExists.mock.mockImplementationOnce(async () => false);
      const result = await service.completeRegistration('alice', 'aa'.repeat(32), '0.0.99');
      assert.ok(result.challengeHex);
      assert.equal(mockCreateAccountRecord.mock.callCount() >= 1, true);
    });

    it('throws if username already taken', async () => {
      mockAccountExists.mock.mockImplementationOnce(async () => true);
      await assert.rejects(
        () => service.completeRegistration('taken', 'aa'.repeat(32), '0.0.99'),
        { message: 'Username already taken' },
      );
    });
  });

  describe('verifyRegistration', () => {
    it('returns token on valid signature', async () => {
      // Issue challenge first
      mockSdkHashUsername.mock.mockImplementationOnce(() => 'hash_for_verify_reg');
      const challengeHex = service.issueChallenge('hash_for_verify_reg');
      assert.ok(challengeHex);

      // Now verify — need hashUsername to return same hash
      mockSdkHashUsername.mock.mockImplementationOnce(() => 'hash_for_verify_reg');
      mockVerifySignature.mock.mockImplementationOnce(() => true);

      const result = await service.verifyRegistration('alice', 'aabb');
      assert.ok(result.token);
      assert.equal(typeof result.token, 'string');
    });

    it('throws on invalid signature', async () => {
      mockSdkHashUsername.mock.mockImplementationOnce(() => 'hash_invalid_sig');
      service.issueChallenge('hash_invalid_sig');

      mockSdkHashUsername.mock.mockImplementationOnce(() => 'hash_invalid_sig');
      mockVerifySignature.mock.mockImplementationOnce(() => false);

      await assert.rejects(
        () => service.verifyRegistration('alice', 'bad'),
        { message: 'invalid signature' },
      );
    });

    it('throws when no pending challenge', async () => {
      // Don't issue a challenge, just try to verify
      mockSdkHashUsername.mock.mockImplementationOnce(() => 'hash_no_challenge');

      await assert.rejects(
        () => service.verifyRegistration('nochal', 'aabb'),
        { message: 'no pending challenge' },
      );
    });
  });

  describe('loginOprf', () => {
    it('returns evaluatedHex, orgId, challengeHex for existing user', async () => {
      mockGetAccountRecord.mock.mockImplementationOnce(async () => ({
        publicKeyHex: 'aa'.repeat(32),
        accountId: '0.0.12345',
        createdAt: new Date().toISOString(),
      }));
      const result = await service.loginOprf('alice', 'aabb');
      assert.ok(result.evaluatedHex);
      assert.ok(result.orgId);
      assert.ok(result.challengeHex);
    });

    it('throws when user not found', async () => {
      mockGetAccountRecord.mock.mockImplementationOnce(async () => null);
      await assert.rejects(
        () => service.loginOprf('unknown', 'aabb'),
        { message: 'user not found' },
      );
    });
  });

  describe('verifyLogin', () => {
    it('returns token and accountId on valid signature', async () => {
      mockSdkHashUsername.mock.mockImplementationOnce(() => 'hash_login_verify');
      service.issueChallenge('hash_login_verify');

      mockSdkHashUsername.mock.mockImplementationOnce(() => 'hash_login_verify');
      mockVerifySignature.mock.mockImplementationOnce(() => true);
      mockGetAccountRecord.mock.mockImplementationOnce(async () => ({
        publicKeyHex: 'aa'.repeat(32),
        accountId: '0.0.55555',
        createdAt: new Date().toISOString(),
      }));

      const result = await service.verifyLogin('alice', 'aabb');
      assert.ok(result.token);
      assert.equal(result.accountId, '0.0.55555');
    });
  });
});
