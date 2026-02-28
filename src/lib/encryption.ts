import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// Re-export RSA envelope encryption from worker-utils
export {
  encryptWithPublicKey,
  decryptWithPrivateKey,
  EncryptionConfigurationError,
  EncryptionFormatError,
} from '@kilocode/worker-utils';
export type { EncryptedEnvelope } from '@kilocode/worker-utils';

// Import error classes for use in local symmetric functions
import { EncryptionConfigurationError, EncryptionFormatError } from '@kilocode/worker-utils';

// Symmetric key functions use node:crypto and are NOT in worker-utils

/**
 * Encrypts a value using AES-256-GCM with a symmetric key
 * Format: iv:authTag:encrypted (all base64)
 *
 * @param value - The plaintext value to encrypt
 * @param keyBase64 - Base64-encoded 32-byte (256-bit) encryption key
 * @returns Encrypted string in format iv:authTag:encrypted
 * @throws EncryptionConfigurationError if key is missing or invalid length
 */
export function encryptWithSymmetricKey(value: string, keyBase64: string): string {
  if (!keyBase64) {
    throw new EncryptionConfigurationError('Encryption key is required');
  }

  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) {
    throw new EncryptionConfigurationError('Encryption key must be exactly 32 bytes (256 bits)');
  }

  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(value, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypts a value encrypted with encryptWithSymmetricKey
 *
 * @param encryptedValue - Encrypted string in format iv:authTag:encrypted
 * @param keyBase64 - Base64-encoded 32-byte (256-bit) encryption key
 * @returns Decrypted plaintext value
 * @throws EncryptionConfigurationError if key is missing or invalid length
 * @throws EncryptionFormatError if encrypted value format is invalid
 */
export function decryptWithSymmetricKey(encryptedValue: string, keyBase64: string): string {
  if (!keyBase64) {
    throw new EncryptionConfigurationError('Encryption key is required');
  }

  const parts = encryptedValue.split(':');
  if (parts.length !== 3) {
    throw new EncryptionFormatError(
      'Invalid encrypted value format: expected iv:authTag:encrypted'
    );
  }
  const [ivBase64, authTagBase64, encrypted] = parts;

  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const key = Buffer.from(keyBase64, 'base64');

  if (key.length !== 32) {
    throw new EncryptionConfigurationError('Encryption key must be exactly 32 bytes (256 bits)');
  }

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
