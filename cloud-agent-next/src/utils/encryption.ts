/**
 * Encryption utilities for cloud-agent worker.
 *
 * Re-exports from @kilocode/encryption with cloud-agent-specific aliases.
 */

export {
  decryptWithPrivateKey,
  decryptSecrets,
  mergeEnvVarsWithSecrets,
  EncryptionConfigurationError as DecryptionConfigurationError,
  EncryptionFormatError as DecryptionFormatError,
} from '@kilocode/encryption';

export type { EncryptedEnvelope as EncryptedSecretEnvelope } from '@kilocode/encryption';

export type EncryptedSecrets = Record<string, import('@kilocode/encryption').EncryptedEnvelope>;
