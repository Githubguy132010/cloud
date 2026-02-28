import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  encryptWithPublicKey,
  decryptWithPrivateKey,
  decryptSecrets,
  mergeEnvVarsWithSecrets,
  EncryptionConfigurationError,
  EncryptionFormatError,
  type EncryptedEnvelope,
} from './encryption.js';

// Generate a fresh RSA-OAEP PKCS#8 key pair for tests.
// The old implementation used `privateDecrypt` with OAEP/SHA-256;
// the new one uses Web Crypto `importKey('pkcs8', ...)`.
function generateKeyPair(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

/**
 * Encrypt using the OLD Node.js-crypto implementation (copy-pasted from
 * src/lib/encryption.ts `encryptWithPublicKey`).  This is our known-good
 * reference: envelopes produced here must round-trip through the new
 * Web Crypto `decryptWithPrivateKey`.
 */
function encryptWithPublicKeyOld(value: string, publicKeyPem: string): EncryptedEnvelope {
  const dek = crypto.generateKeySync('aes', { length: 256 });
  const dekBuffer = dek.export();

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', dekBuffer, iv);
  let encrypted = cipher.update(value, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  const encryptedDataBuffer = Buffer.concat([iv, encrypted, authTag]);
  const encryptedData = encryptedDataBuffer.toString('base64');

  const encryptedDEKBuffer = crypto.publicEncrypt(
    { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    dekBuffer
  );
  const encryptedDEK = encryptedDEKBuffer.toString('base64');

  return { encryptedData, encryptedDEK, algorithm: 'rsa-aes-256-gcm', version: 1 };
}

// Also produce a reference decrypt with the OLD implementation so we can
// verify both directions independently.
function decryptWithPrivateKeyOld(envelope: EncryptedEnvelope, privateKeyPem: string): string {
  const dekBuffer = crypto.privateDecrypt(
    { key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    Buffer.from(envelope.encryptedDEK, 'base64')
  );

  const encryptedDataBuffer = Buffer.from(envelope.encryptedData, 'base64');
  const iv = encryptedDataBuffer.subarray(0, 16);
  const authTag = encryptedDataBuffer.subarray(encryptedDataBuffer.length - 16);
  const ciphertext = encryptedDataBuffer.subarray(16, encryptedDataBuffer.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', dekBuffer, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ---- tests ----

describe('encryption — old impl sanity check', () => {
  const { publicKey, privateKey } = generateKeyPair();

  it('old encrypt + old decrypt round-trips', () => {
    const envelope = encryptWithPublicKeyOld('hello world', publicKey);
    expect(decryptWithPrivateKeyOld(envelope, privateKey)).toBe('hello world');
  });
});

describe('decryptWithPrivateKey (Web Crypto)', () => {
  const { publicKey, privateKey } = generateKeyPair();

  it('decrypts an envelope produced by the old Node.js implementation', async () => {
    const plaintext = 'super secret API_KEY=abc123';
    const envelope = encryptWithPublicKeyOld(plaintext, publicKey);
    const result = await decryptWithPrivateKey(envelope, privateKey);
    expect(result).toBe(plaintext);
  });

  it('decrypts empty string', async () => {
    const envelope = encryptWithPublicKeyOld('', publicKey);
    expect(await decryptWithPrivateKey(envelope, privateKey)).toBe('');
  });

  it('decrypts unicode content', async () => {
    const plaintext = 'hello 🌍 世界 مرحبا';
    const envelope = encryptWithPublicKeyOld(plaintext, publicKey);
    expect(await decryptWithPrivateKey(envelope, privateKey)).toBe(plaintext);
  });

  it('decrypts long values (> 1 AES block)', async () => {
    const plaintext = 'x'.repeat(10_000);
    const envelope = encryptWithPublicKeyOld(plaintext, publicKey);
    expect(await decryptWithPrivateKey(envelope, privateKey)).toBe(plaintext);
  });

  it('throws EncryptionFormatError for bad algorithm', async () => {
    const envelope = encryptWithPublicKeyOld('test', publicKey);
    const bad = { ...envelope, algorithm: 'aes-128-cbc' } as unknown as EncryptedEnvelope;
    await expect(decryptWithPrivateKey(bad, privateKey)).rejects.toThrow(EncryptionFormatError);
  });

  it('throws EncryptionFormatError for bad version', async () => {
    const envelope = encryptWithPublicKeyOld('test', publicKey);
    const bad = { ...envelope, version: 2 } as unknown as EncryptedEnvelope;
    await expect(decryptWithPrivateKey(bad, privateKey)).rejects.toThrow(EncryptionFormatError);
  });

  it('throws EncryptionFormatError for missing fields', async () => {
    const bad = { algorithm: 'rsa-aes-256-gcm', version: 1 } as unknown as EncryptedEnvelope;
    await expect(decryptWithPrivateKey(bad, privateKey)).rejects.toThrow(EncryptionFormatError);
  });

  it('throws EncryptionConfigurationError for wrong private key', async () => {
    const other = generateKeyPair();
    const envelope = encryptWithPublicKeyOld('test', publicKey);
    await expect(decryptWithPrivateKey(envelope, other.privateKey)).rejects.toThrow(
      EncryptionConfigurationError
    );
  });

  it('throws EncryptionConfigurationError for empty key', async () => {
    const envelope = encryptWithPublicKeyOld('test', publicKey);
    await expect(decryptWithPrivateKey(envelope, '')).rejects.toThrow(EncryptionConfigurationError);
  });

  it('throws EncryptionConfigurationError for PKCS#1 key', async () => {
    const { privateKey: pkcs1 } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });
    const envelope = encryptWithPublicKeyOld('test', publicKey);
    await expect(decryptWithPrivateKey(envelope, pkcs1)).rejects.toThrow(
      EncryptionConfigurationError
    );
    await expect(decryptWithPrivateKey(envelope, pkcs1)).rejects.toThrow(/PKCS#1/);
  });

  it('throws EncryptionFormatError for truncated encrypted data', async () => {
    const envelope = encryptWithPublicKeyOld('hello', publicKey);
    const bad = { ...envelope, encryptedData: Buffer.from('short').toString('base64') };
    await expect(decryptWithPrivateKey(bad, privateKey)).rejects.toThrow(EncryptionFormatError);
  });
});

describe('decryptSecrets', () => {
  const { publicKey, privateKey } = generateKeyPair();

  it('decrypts a map of envelopes', async () => {
    const secrets = {
      API_KEY: encryptWithPublicKeyOld('key123', publicKey),
      DB_PASS: encryptWithPublicKeyOld('pass456', publicKey),
    };
    const result = await decryptSecrets(secrets, privateKey);
    expect(result).toEqual({ API_KEY: 'key123', DB_PASS: 'pass456' });
  });

  it('returns empty object for empty input', async () => {
    expect(await decryptSecrets({}, privateKey)).toEqual({});
  });
});

describe('mergeEnvVarsWithSecrets', () => {
  const { publicKey, privateKey } = generateKeyPair();

  it('merges env vars with decrypted secrets (secrets win)', async () => {
    const envVars = { HOST: 'localhost', API_KEY: 'old' };
    const secrets = {
      API_KEY: encryptWithPublicKeyOld('new-key', publicKey),
      DB_PASS: encryptWithPublicKeyOld('secret', publicKey),
    };
    const result = await mergeEnvVarsWithSecrets(envVars, secrets, privateKey);
    expect(result).toEqual({ HOST: 'localhost', API_KEY: 'new-key', DB_PASS: 'secret' });
  });

  it('returns env vars unchanged when no secrets', async () => {
    const envVars = { HOST: 'localhost' };
    expect(await mergeEnvVarsWithSecrets(envVars, undefined, undefined)).toEqual(envVars);
    expect(await mergeEnvVarsWithSecrets(envVars, {}, undefined)).toEqual(envVars);
  });

  it('throws when secrets present but no private key', async () => {
    const secrets = { KEY: encryptWithPublicKeyOld('val', publicKey) };
    await expect(mergeEnvVarsWithSecrets(undefined, secrets, undefined)).rejects.toThrow(
      EncryptionConfigurationError
    );
  });
});

// ---- encryptWithPublicKey (Web Crypto) ----

describe('encryptWithPublicKey (Web Crypto)', () => {
  const { publicKey, privateKey } = generateKeyPair();

  it('produces a valid EncryptedEnvelope', async () => {
    const envelope = await encryptWithPublicKey('hello', publicKey);
    expect(envelope.algorithm).toBe('rsa-aes-256-gcm');
    expect(envelope.version).toBe(1);
    expect(typeof envelope.encryptedData).toBe('string');
    expect(typeof envelope.encryptedDEK).toBe('string');
  });

  describe('new encrypt → new decrypt', () => {
    it('round-trips a simple string', async () => {
      const envelope = await encryptWithPublicKey('hello world', publicKey);
      expect(await decryptWithPrivateKey(envelope, privateKey)).toBe('hello world');
    });

    it('round-trips an empty string', async () => {
      const envelope = await encryptWithPublicKey('', publicKey);
      expect(await decryptWithPrivateKey(envelope, privateKey)).toBe('');
    });

    it('round-trips unicode content', async () => {
      const plaintext = 'hello 🌍 世界 مرحبا';
      const envelope = await encryptWithPublicKey(plaintext, publicKey);
      expect(await decryptWithPrivateKey(envelope, privateKey)).toBe(plaintext);
    });

    it('round-trips a long string (> 1 AES block)', async () => {
      const plaintext = 'x'.repeat(10_000);
      const envelope = await encryptWithPublicKey(plaintext, publicKey);
      expect(await decryptWithPrivateKey(envelope, privateKey)).toBe(plaintext);
    });
  });

  describe('new encrypt → old decrypt (cross-compatibility)', () => {
    it('round-trips a simple string', async () => {
      const envelope = await encryptWithPublicKey('cross-compat test', publicKey);
      expect(decryptWithPrivateKeyOld(envelope, privateKey)).toBe('cross-compat test');
    });

    it('round-trips an empty string', async () => {
      const envelope = await encryptWithPublicKey('', publicKey);
      expect(decryptWithPrivateKeyOld(envelope, privateKey)).toBe('');
    });

    it('round-trips unicode content', async () => {
      const plaintext = 'hello 🌍 世界 مرحبا';
      const envelope = await encryptWithPublicKey(plaintext, publicKey);
      expect(decryptWithPrivateKeyOld(envelope, privateKey)).toBe(plaintext);
    });

    it('round-trips a long string', async () => {
      const plaintext = 'y'.repeat(10_000);
      const envelope = await encryptWithPublicKey(plaintext, publicKey);
      expect(decryptWithPrivateKeyOld(envelope, privateKey)).toBe(plaintext);
    });
  });

  describe('error handling', () => {
    it('throws EncryptionConfigurationError for empty public key', async () => {
      await expect(encryptWithPublicKey('test', '')).rejects.toThrow(EncryptionConfigurationError);
    });

    it('throws EncryptionConfigurationError for invalid public key', async () => {
      await expect(encryptWithPublicKey('test', 'not-a-pem-key')).rejects.toThrow(
        EncryptionConfigurationError
      );
    });
  });
});
