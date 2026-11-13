import crypto from 'node:crypto';

const SCRYPT_PREFIX = 'scrypt$';

/**
 * Hash a plaintext password with a CSPRNG 16-byte salt using Node crypto.scryptSync.
 */
export function hashPassword(passwordPlain: string): string {
  if (!passwordPlain) {
    throw new Error('Password cannot be empty.');
  }
  if (passwordPlain.startsWith(SCRYPT_PREFIX)) {
    return passwordPlain;
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(passwordPlain, salt, 64, { N: 16384, r: 8, p: 1 });
  return `${SCRYPT_PREFIX}${salt}$${derived.toString('hex')}`;
}

export function isHashedPassword(stored: string): boolean {
  return typeof stored === 'string' && stored.startsWith(SCRYPT_PREFIX);
}

/**
 * Timing-safe password verification.
 * Also supports legacy unhashed values from old localStorage databases and flags `needsRehash`
 * so they are transparently upgraded to salted scrypt on first check/migration.
 */
export function verifyPassword(
  passwordPlain: string,
  storedHash: string
): { valid: boolean; needsRehash: boolean } {
  if (!storedHash || !passwordPlain) {
    return { valid: false, needsRehash: false };
  }

  if (storedHash.startsWith(SCRYPT_PREFIX)) {
    const parts = storedHash.slice(SCRYPT_PREFIX.length).split('$');
    if (parts.length !== 2) return { valid: false, needsRehash: false };
    const [salt, hexHash] = parts;
    try {
      const expected = Buffer.from(hexHash, 'hex');
      const actual = crypto.scryptSync(passwordPlain, salt, 64, { N: 16384, r: 8, p: 1 });
      if (expected.length !== actual.length) return { valid: false, needsRehash: false };
      return { valid: crypto.timingSafeEqual(expected, actual), needsRehash: false };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  // Legacy plaintext compatibility with timing-safe length check
  const a = Buffer.from(passwordPlain, 'utf8');
  const b = Buffer.from(storedHash, 'utf8');
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { valid, needsRehash: valid };
}

export function generateRandomBackupKeyNode(): string {
  return crypto.randomBytes(32).toString('base64');
}

export function isValid32ByteBase64KeyNode(key: string): boolean {
  try {
    return Buffer.from(key.trim(), 'base64').length === 32;
  } catch {
    return false;
  }
}

/**
 * Encrypts bytes with AES-256-GCM in the exact wire format used by src/services/crypto.ts:
 * [12 bytes IV] + [ciphertext] + [16 bytes GCM AuthTag]
 */
export function encryptBufferAES256GCM(plaintext: Buffer | string, base64Key: string): Buffer {
  const keyBuf = Buffer.from(base64Key.trim(), 'base64');
  if (keyBuf.length !== 32) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be exactly 32 bytes (Base64).');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  const inputBuf = typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext;
  const encrypted = Buffer.concat([cipher.update(inputBuf), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, encrypted, authTag]);
}

/**
 * Decrypts AES-256-GCM wire payload [12-byte IV][ciphertext][16-byte AuthTag]
 */
export function decryptBufferAES256GCM(encryptedBytes: Buffer, base64Key: string): Buffer {
  const keyBuf = Buffer.from(base64Key.trim(), 'base64');
  if (keyBuf.length !== 32) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be exactly 32 bytes (Base64).');
  }
  if (encryptedBytes.length < 29) {
    throw new Error('Encrypted archive is truncated or corrupted.');
  }

  const iv = encryptedBytes.subarray(0, 12);
  const authTag = encryptedBytes.subarray(encryptedBytes.length - 16);
  const ciphertext = encryptedBytes.subarray(12, encryptedBytes.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
