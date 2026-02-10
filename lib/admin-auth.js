/**
 * Authentification admin simple par token HMAC
 * Le mot de passe admin est stocké dans ADMIN_SECRET (variable d'environnement Vercel)
 */

import crypto from 'crypto';

const TOKEN_TTL_MS = 4 * 60 * 60 * 1000; // 4 heures

export function generateAdminToken() {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw new Error('ADMIN_SECRET non défini');

  const timestamp = Date.now().toString();
  const hmac = crypto.createHmac('sha256', secret)
    .update(timestamp)
    .digest('hex');
  return `${timestamp}.${hmac}`;
}

export function verifyAdminToken(token) {
  const secret = process.env.ADMIN_SECRET;
  if (!token || !secret) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [timestamp, hmac] = parts;
  if (!timestamp || !hmac) return false;

  const expected = crypto.createHmac('sha256', secret)
    .update(timestamp)
    .digest('hex');

  // Comparaison en temps constant pour éviter les timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expected, 'hex'))) {
    return false;
  }

  const age = Date.now() - parseInt(timestamp, 10);
  return age >= 0 && age < TOKEN_TTL_MS;
}
