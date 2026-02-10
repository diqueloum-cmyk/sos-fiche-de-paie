import { generateAdminToken } from '../../lib/admin-auth.js';
import { checkRateLimit } from '../../lib/rate-limit.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Rate limiting : 5 tentatives/heure par IP
  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
  const rateLimitResult = await checkRateLimit(`admin-login:${ip}`, 5, 3600000);

  if (!rateLimitResult.allowed) {
    return res.status(429).json({
      error: 'Trop de tentatives. Réessayez plus tard.',
      retryAfter: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)
    });
  }

  const { password } = req.body || {};

  if (!password || !process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  if (password !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  const token = generateAdminToken();
  return res.status(200).json({ success: true, token });
}
