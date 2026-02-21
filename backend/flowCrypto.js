// backend/flowCrypto.js — WhatsApp Flows encryption/decryption
import crypto from 'crypto';

const PRIVATE_KEY = () => process.env.FLOWS_PRIVATE_KEY?.replace(/\\n/g, '\n');
const PASSPHRASE = () => process.env.FLOWS_PASSPHRASE || undefined;

/**
 * Decrypt an incoming WhatsApp Flows data exchange request.
 * @param {Object} body - { encrypted_aes_key, encrypted_flow_data, initial_vector }
 * @returns {{ decryptedBody: Object, aesKeyBuffer: Buffer, initialVectorBuffer: Buffer }}
 */
function decryptRequest(body) {
  const { encrypted_aes_key, encrypted_flow_data, initial_vector } = body;
  const privateKey = PRIVATE_KEY();
  if (!privateKey) throw new Error('FLOWS_PRIVATE_KEY not configured');

  const decryptedAesKey = crypto.privateDecrypt(
    {
      key: crypto.createPrivateKey({ key: privateKey, passphrase: PASSPHRASE() }),
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(encrypted_aes_key, 'base64')
  );

  const flowDataBuffer = Buffer.from(encrypted_flow_data, 'base64');
  const initialVectorBuffer = Buffer.from(initial_vector, 'base64');

  const TAG_LENGTH = 16;
  const encryptedBody = flowDataBuffer.subarray(0, -TAG_LENGTH);
  const authTag = flowDataBuffer.subarray(-TAG_LENGTH);

  const decipher = crypto.createDecipheriv('aes-128-gcm', decryptedAesKey, initialVectorBuffer);
  decipher.setAuthTag(authTag);

  const decryptedJSON = Buffer.concat([
    decipher.update(encryptedBody),
    decipher.final(),
  ]).toString('utf-8');

  return {
    decryptedBody: JSON.parse(decryptedJSON),
    aesKeyBuffer: decryptedAesKey,
    initialVectorBuffer,
  };
}

/**
 * Encrypt a response to send back to WhatsApp Flows.
 * @param {Object} response - The response object (screen + data)
 * @param {Buffer} aesKeyBuffer - The decrypted AES key
 * @param {Buffer} initialVectorBuffer - The original IV (will be flipped)
 * @returns {string} Base64-encoded encrypted response
 */
function encryptResponse(response, aesKeyBuffer, initialVectorBuffer) {
  const flippedIV = Buffer.from(initialVectorBuffer.map(b => ~b & 0xff));

  const cipher = crypto.createCipheriv('aes-128-gcm', aesKeyBuffer, flippedIV);
  return Buffer.concat([
    cipher.update(JSON.stringify(response), 'utf-8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString('base64');
}

export { decryptRequest, encryptResponse };
