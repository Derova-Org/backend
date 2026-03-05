/**
 * Unit tests for the generic JSON store (data/ directory).
 *
 * Mocks the fs module so no actual files are created.
 * Uses Node's built-in test runner + mock.module().
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Mock fs BEFORE importing the store
// ---------------------------------------------------------------------------

const fileStore = new Map<string, string>();
const dirStore = new Set<string>();

const mockExistsSync = mock.fn((path: string) => fileStore.has(path) || dirStore.has(path));
const mockReadFileSync = mock.fn((path: string) => {
  if (!fileStore.has(path)) throw new Error(`ENOENT: ${path}`);
  return fileStore.get(path)!;
});
const mockWriteFileSync = mock.fn((path: string, data: string) => {
  fileStore.set(path, data);
});
const mockMkdirSync = mock.fn((path: string) => {
  dirStore.add(path);
});

mock.module('node:fs', {
  namedExports: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync,
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

const { readJson, writeJson, loadOrCreate } = await import('../../src/storage/store.js');

describe('JSON store (store.ts)', () => {
  beforeEach(() => {
    fileStore.clear();
    dirStore.clear();
    mockExistsSync.mock.resetCalls();
    mockReadFileSync.mock.resetCalls();
    mockWriteFileSync.mock.resetCalls();
    mockMkdirSync.mock.resetCalls();
  });

  describe('readJson', () => {
    it('returns null when file does not exist', () => {
      const result = readJson('nonexistent.json');
      assert.equal(result, null);
    });

    it('reads and parses existing JSON file', () => {
      // We need to match the resolved path that store.ts will use
      // Store resolves: resolve(DATA_DIR, filename) where DATA_DIR = resolve(import.meta.dirname, '../../data')
      // Since we mock existsSync, we just need it to return true for any call with our filename
      mockExistsSync.mock.mockImplementation((path: string) => path.endsWith('test.json'));
      mockReadFileSync.mock.mockImplementation(() => '{"key": "value"}');

      const result = readJson<{ key: string }>('test.json');
      assert.deepEqual(result, { key: 'value' });
    });
  });

  describe('writeJson', () => {
    it('writes JSON to file and creates directory if needed', () => {
      mockExistsSync.mock.mockImplementation(() => false);

      writeJson('output.json', { hello: 'world' });

      assert.ok(mockMkdirSync.mock.callCount() >= 1);
      assert.ok(mockWriteFileSync.mock.callCount() >= 1);
      const written = mockWriteFileSync.mock.calls[0].arguments[1];
      assert.deepEqual(JSON.parse(written as string), { hello: 'world' });
    });

    it('skips mkdir if directory already exists', () => {
      mockExistsSync.mock.mockImplementation(() => true);

      writeJson('exists.json', { a: 1 });

      assert.equal(mockMkdirSync.mock.callCount(), 0);
      assert.ok(mockWriteFileSync.mock.callCount() >= 1);
    });
  });

  describe('loadOrCreate', () => {
    it('returns existing data if file exists', () => {
      mockExistsSync.mock.mockImplementation((path: string) => path.endsWith('cached.json'));
      mockReadFileSync.mock.mockImplementation(() => '{"cached": true}');

      const result = loadOrCreate('cached.json', () => ({ cached: false }));
      assert.deepEqual(result, { cached: true });
    });

    it('creates file with defaults if it does not exist', () => {
      mockExistsSync.mock.mockImplementation((path: string) => {
        // File doesn't exist, but dir check for ensureDir should also return false
        return false;
      });

      const result = loadOrCreate('new.json', () => ({ fresh: true }));
      assert.deepEqual(result, { fresh: true });
      assert.ok(mockWriteFileSync.mock.callCount() >= 1);
    });
  });
});
