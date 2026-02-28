import { describe, test, expect, beforeAll } from '@jest/globals';
import { generateKeyPairSync } from 'crypto';
import {
  encryptWithPublicKey,
  decryptWithPrivateKey,
  EncryptionConfigurationError,
  EncryptionFormatError,
  type EncryptedEnvelope,
} from './encryption';

describe('encryption', () => {
  let publicKey: string;
  let privateKey: string;
  let wrongPrivateKey: string;

  beforeAll(() => {
    // Generate RSA key pair for testing
    const { publicKey: pubKey, privateKey: privKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    publicKey = pubKey;
    privateKey = privKey;

    // Generate another key pair for testing mismatched keys
    const { privateKey: wrongPrivKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
      },
    });

    wrongPrivateKey = wrongPrivKey;
  });

  test('encrypts successfully with correct envelope structure and decrypts correctly', async () => {
    const testValue = 'test secret value';

    // Test encryption produces correct structure
    const envelope = await encryptWithPublicKey(testValue, publicKey);

    expect(envelope).toHaveProperty('encryptedData');
    expect(envelope).toHaveProperty('encryptedDEK');
    expect(envelope).toHaveProperty('algorithm');
    expect(envelope).toHaveProperty('version');
    expect(envelope.algorithm).toBe('rsa-aes-256-gcm');
    expect(envelope.version).toBe(1);
    expect(typeof envelope.encryptedData).toBe('string');
    expect(typeof envelope.encryptedDEK).toBe('string');
    expect(envelope.encryptedData.length).toBeGreaterThan(0);
    expect(envelope.encryptedDEK.length).toBeGreaterThan(0);

    // Test basic round-trip decryption
    const decrypted = await decryptWithPrivateKey(envelope, privateKey);
    expect(decrypted).toBe(testValue);
  });

  test('handles edge cases: empty strings, long strings, unicode, and multiple values', async () => {
    // Empty string
    const emptyEnvelope = await encryptWithPublicKey('', publicKey);
    expect(await decryptWithPrivateKey(emptyEnvelope, privateKey)).toBe('');

    // Long string (~30KB)
    const longValue = 'Lorem ipsum dolor sit amet. '.repeat(1000);
    const longEnvelope = await encryptWithPublicKey(longValue, publicKey);
    const longDecrypted = await decryptWithPrivateKey(longEnvelope, privateKey);
    expect(longDecrypted).toBe(longValue);
    expect(longDecrypted.length).toBe(longValue.length);

    // Unicode and special characters
    const testValues = [
      'Hello 世界! 🌍',
      '¡Hola! ¿Cómo estás?',
      'Привет мир',
      'こんにちは',
      '你好世界',
      'Emoji test 🚀 🎉 🔐',
      'Special chars: !@#$%^&*(){}[]|\\:";\'<>?,./~`',
      'Newlines\nand\ttabs',
    ];

    for (const testValue of testValues) {
      const envelope = await encryptWithPublicKey(testValue, publicKey);
      const decrypted = await decryptWithPrivateKey(envelope, privateKey);
      expect(decrypted).toBe(testValue);
    }

    // Multiple values
    const values = ['value1', 'value2', 'value3', 'value4', 'value5'];
    const envelopes: EncryptedEnvelope[] = await Promise.all(
      values.map(value => encryptWithPublicKey(value, publicKey))
    );
    const decrypted = await Promise.all(
      envelopes.map(envelope => decryptWithPrivateKey(envelope, privateKey))
    );
    expect(decrypted).toEqual(values);
  });

  test('produces non-deterministic encrypted output for security', async () => {
    const testValue = 'same input value';

    const envelope1 = await encryptWithPublicKey(testValue, publicKey);
    const envelope2 = await encryptWithPublicKey(testValue, publicKey);

    // Different random IV and DEK should result in different encrypted outputs
    expect(envelope1.encryptedData).not.toBe(envelope2.encryptedData);
    expect(envelope1.encryptedDEK).not.toBe(envelope2.encryptedDEK);

    // But both should decrypt to the same value
    expect(await decryptWithPrivateKey(envelope1, privateKey)).toBe(testValue);
    expect(await decryptWithPrivateKey(envelope2, privateKey)).toBe(testValue);
  });

  test('throws EncryptionConfigurationError for invalid public keys', async () => {
    // Missing public key
    await expect(encryptWithPublicKey('test value', '')).rejects.toThrow(
      EncryptionConfigurationError
    );

    await expect(encryptWithPublicKey('test value', '')).rejects.toThrow(
      'Public key parameter is required'
    );

    // Invalid public key format
    await expect(encryptWithPublicKey('test value', 'not a valid public key')).rejects.toThrow(
      EncryptionConfigurationError
    );

    await expect(encryptWithPublicKey('test value', 'not a valid public key')).rejects.toThrow(
      'Encryption failed'
    );
  });

  test('throws EncryptionConfigurationError for invalid private keys', async () => {
    const envelope = await encryptWithPublicKey('test value', publicKey);

    // Missing private key
    await expect(decryptWithPrivateKey(envelope, '')).rejects.toThrow(EncryptionConfigurationError);
    await expect(decryptWithPrivateKey(envelope, '')).rejects.toThrow(
      'Private key parameter is required'
    );

    // Mismatched private key
    await expect(decryptWithPrivateKey(envelope, wrongPrivateKey)).rejects.toThrow(
      EncryptionConfigurationError
    );
    await expect(decryptWithPrivateKey(envelope, wrongPrivateKey)).rejects.toThrow(
      'Decryption failed'
    );
  });

  test('throws EncryptionFormatError for invalid envelope structure', async () => {
    // Null envelope
    await expect(
      decryptWithPrivateKey(null as unknown as EncryptedEnvelope, privateKey)
    ).rejects.toThrow(EncryptionFormatError);
    await expect(
      decryptWithPrivateKey(null as unknown as EncryptedEnvelope, privateKey)
    ).rejects.toThrow('Invalid envelope: must be an object');

    // Not an object
    await expect(
      decryptWithPrivateKey('not an object' as unknown as EncryptedEnvelope, privateKey)
    ).rejects.toThrow(EncryptionFormatError);
    await expect(
      decryptWithPrivateKey('not an object' as unknown as EncryptedEnvelope, privateKey)
    ).rejects.toThrow('Invalid envelope: must be an object');

    // Missing encryptedData
    const missingData = {
      encryptedDEK: 'test',
      algorithm: 'rsa-aes-256-gcm',
      version: 1,
    } as unknown as EncryptedEnvelope;
    await expect(decryptWithPrivateKey(missingData, privateKey)).rejects.toThrow(
      EncryptionFormatError
    );
    await expect(decryptWithPrivateKey(missingData, privateKey)).rejects.toThrow(
      'missing encryptedData or encryptedDEK'
    );

    // Missing encryptedDEK
    const missingDEK = {
      encryptedData: 'test',
      algorithm: 'rsa-aes-256-gcm',
      version: 1,
    } as unknown as EncryptedEnvelope;
    await expect(decryptWithPrivateKey(missingDEK, privateKey)).rejects.toThrow(
      EncryptionFormatError
    );
    await expect(decryptWithPrivateKey(missingDEK, privateKey)).rejects.toThrow(
      'missing encryptedData or encryptedDEK'
    );

    // Unsupported algorithm
    const badAlgorithm: EncryptedEnvelope = {
      encryptedData: 'test',
      encryptedDEK: 'test',
      algorithm: 'aes-128-cbc' as unknown as 'rsa-aes-256-gcm',
      version: 1,
    };
    await expect(decryptWithPrivateKey(badAlgorithm, privateKey)).rejects.toThrow(
      EncryptionFormatError
    );
    await expect(decryptWithPrivateKey(badAlgorithm, privateKey)).rejects.toThrow(
      'Unsupported algorithm'
    );

    // Unsupported version
    const badVersion: EncryptedEnvelope = {
      encryptedData: 'test',
      encryptedDEK: 'test',
      algorithm: 'rsa-aes-256-gcm',
      version: 2 as unknown as 1,
    };
    await expect(decryptWithPrivateKey(badVersion, privateKey)).rejects.toThrow(
      EncryptionFormatError
    );
    await expect(decryptWithPrivateKey(badVersion, privateKey)).rejects.toThrow(
      'Unsupported version'
    );

    // Encrypted data too short
    const validEnvelope = await encryptWithPublicKey('test', publicKey);
    const tooShort: EncryptedEnvelope = {
      ...validEnvelope,
      encryptedData: Buffer.from('short').toString('base64'), // Less than 32 bytes
    };
    await expect(decryptWithPrivateKey(tooShort, privateKey)).rejects.toThrow(
      EncryptionFormatError
    );
    await expect(decryptWithPrivateKey(tooShort, privateKey)).rejects.toThrow(
      'Invalid encrypted data: too short'
    );
  });

  test('throws EncryptionConfigurationError for corrupted data (auth tag validation)', async () => {
    const envelope = await encryptWithPublicKey('test value', publicKey);

    // Corrupt the encrypted data by changing bytes
    const corruptedData = Buffer.from(envelope.encryptedData, 'base64');
    corruptedData[20] ^= 0xff; // Flip some bits in the middle
    const corruptedEnvelope: EncryptedEnvelope = {
      ...envelope,
      encryptedData: corruptedData.toString('base64'),
    };

    await expect(decryptWithPrivateKey(corruptedEnvelope, privateKey)).rejects.toThrow(
      EncryptionConfigurationError
    );
    await expect(decryptWithPrivateKey(corruptedEnvelope, privateKey)).rejects.toThrow(
      'Decryption failed'
    );
  });
});
