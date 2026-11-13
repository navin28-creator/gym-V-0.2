/**
 * Cryptographic services for Flex & Flow automated backups.
 * Implements AES-256-GCM encryption & decryption matching Node.js crypto module.
 */

// Helper to convert base64 string to Uint8Array
export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = window.atob(base64.trim());
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper to convert Uint8Array to base64 string
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Generate a valid 32-byte base64 key
export function generateRandomBackupKey(): string {
  const randomBytes = new Uint8Array(32);
  window.crypto.getRandomValues(randomBytes);
  return uint8ArrayToBase64(randomBytes);
}

// Validate if key is a 32-byte base64 string
export function isValid32ByteBase64Key(key: string): boolean {
  try {
    const bytes = base64ToUint8Array(key);
    return bytes.length === 32;
  } catch {
    return false;
  }
}

/**
 * Encrypts SQLite data using AES-256-GCM.
 * Structure of output:
 * [12 bytes IV] + [AES-256-GCM Ciphertext with 16 bytes authentication tag]
 */
export async function encryptSqliteBackup(
  plaintext: string | Uint8Array,
  base64Key: string
): Promise<Uint8Array> {
  const rawKey = base64ToUint8Array(base64Key);
  if (rawKey.length !== 32) {
    throw new Error('Encryption key must be exactly 32 bytes (256 bits).');
  }

  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    rawKey as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = new Uint8Array(12);
  window.crypto.getRandomValues(iv);

  const dataToEncrypt =
    typeof plaintext === 'string' ? new TextEncoder().encode(plaintext) : plaintext;

  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
      tagLength: 128,
    },
    cryptoKey,
    dataToEncrypt as BufferSource
  );

  const ciphertextArray = new Uint8Array(ciphertextBuffer);
  const combined = new Uint8Array(iv.length + ciphertextArray.length);
  combined.set(iv, 0);
  combined.set(ciphertextArray, iv.length);

  return combined;
}

/**
 * Decrypts an AES-256-GCM encrypted backup (.sqlite.enc) using the base64 key.
 */
export async function decryptSqliteBackup(
  encryptedBytes: Uint8Array,
  base64Key: string
): Promise<string> {
  const rawKey = base64ToUint8Array(base64Key);
  if (rawKey.length !== 32) {
    throw new Error('Encryption key must be exactly 32 bytes (256 bits).');
  }

  if (encryptedBytes.length < 28) {
    // 12 bytes IV + at least 16 bytes auth tag
    throw new Error('Encrypted backup file is too small or corrupted.');
  }

  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    rawKey as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const iv = encryptedBytes.slice(0, 12);
  const ciphertextWithTag = encryptedBytes.slice(12);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
      tagLength: 128,
    },
    cryptoKey,
    ciphertextWithTag as BufferSource
  );

  return new TextDecoder().decode(decryptedBuffer);
}

// Indian Rupee formatting (e.g. ₹12,500)
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

// Format date & time in Asia/Kolkata timezone
export function formatKolkataDateTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return isoString;
  }
}

export function formatKolkataDate(isoOrDateString: string): string {
  try {
    const date = new Date(isoOrDateString);
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return isoOrDateString;
  }
}
