/**
 * Rate Limiting avec Upstash Redis
 * Compatible avec les serverless functions Vercel
 */

import { Redis } from '@upstash/redis';

// Initialisation du client Redis (lazy loading)
let redis = null;

function getRedisClient() {
  if (!redis) {
    // Vérifier que les variables d'environnement sont définies
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      console.warn('⚠️  UPSTASH_REDIS_REST_URL ou UPSTASH_REDIS_REST_TOKEN non défini - rate limiting désactivé');
      return null;
    }

    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

/**
 * Vérifie si une requête dépasse le rate limit
 *
 * @param {string} identifier - Identifiant unique (IP, email, user ID, etc.)
 * @param {number} maxRequests - Nombre max de requêtes autorisées
 * @param {number} windowMs - Fenêtre de temps en millisecondes
 * @returns {Promise<{allowed: boolean, remaining: number, resetAt: number}>}
 */
export async function checkRateLimit(identifier, maxRequests = 3, windowMs = 3600000) {
  const client = getRedisClient();

  // Fallback si Redis n'est pas configuré (développement)
  if (!client) {
    console.warn('Rate limiting désactivé - Redis non configuré');
    return {
      allowed: true,
      remaining: maxRequests,
      resetAt: Date.now() + windowMs
    };
  }

  try {
    const key = `ratelimit:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Utiliser une transaction Redis pour atomicité
    const pipeline = client.pipeline();

    // Supprimer les entrées expirées
    pipeline.zremrangebyscore(key, 0, windowStart);

    // Compter les requêtes dans la fenêtre
    pipeline.zcard(key);

    // Ajouter la nouvelle requête
    pipeline.zadd(key, { score: now, member: now.toString() });

    // Définir l'expiration de la clé
    pipeline.expire(key, Math.ceil(windowMs / 1000));

    const results = await pipeline.exec();

    // results[1] contient le nombre de requêtes avant l'ajout
    const requestCount = results[1] || 0;

    const allowed = requestCount < maxRequests;
    const remaining = Math.max(0, maxRequests - requestCount - 1);
    const resetAt = now + windowMs;

    return {
      allowed,
      remaining,
      resetAt
    };

  } catch (error) {
    console.error('Erreur rate limiting:', error);

    // En cas d'erreur Redis, on autorise la requête (fail-open)
    // mais on log l'erreur pour investigation
    return {
      allowed: true,
      remaining: maxRequests,
      resetAt: Date.now() + windowMs,
      error: true
    };
  }
}

/**
 * Middleware Express-compatible pour rate limiting
 *
 * @param {Object} options - Configuration
 * @param {number} options.maxRequests - Nombre max de requêtes
 * @param {number} options.windowMs - Fenêtre de temps en ms
 * @param {Function} options.keyGenerator - Fonction pour générer la clé (req => string)
 * @returns {Function} Middleware Express
 */
export function rateLimitMiddleware(options = {}) {
  const {
    maxRequests = 10,
    windowMs = 60000, // 1 minute par défaut
    keyGenerator = (req) => {
      // Par défaut, utiliser l'IP
      return req.headers['x-forwarded-for'] ||
             req.headers['x-real-ip'] ||
             req.socket?.remoteAddress ||
             'unknown';
    }
  } = options;

  return async (req, res, next) => {
    const identifier = keyGenerator(req);
    const result = await checkRateLimit(identifier, maxRequests, windowMs);

    // Ajouter les headers standard de rate limiting
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', new Date(result.resetAt).toISOString());

    if (!result.allowed) {
      return res.status(429).json({
        error: 'Trop de requêtes. Veuillez réessayer plus tard.',
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000)
      });
    }

    next();
  };
}

/**
 * Réinitialise le compteur pour un identifiant donné
 * Utile pour les tests ou la réinitialisation manuelle
 *
 * @param {string} identifier - Identifiant à réinitialiser
 */
export async function resetRateLimit(identifier) {
  const client = getRedisClient();
  if (!client) return;

  try {
    const key = `ratelimit:${identifier}`;
    await client.del(key);
  } catch (error) {
    console.error('Erreur reset rate limit:', error);
  }
}

/**
 * Obtient les informations de rate limit pour un identifiant
 *
 * @param {string} identifier - Identifiant à vérifier
 * @param {number} windowMs - Fenêtre de temps en ms
 * @returns {Promise<{count: number, oldestRequest: number}>}
 */
export async function getRateLimitInfo(identifier, windowMs = 3600000) {
  const client = getRedisClient();
  if (!client) {
    return { count: 0, oldestRequest: null };
  }

  try {
    const key = `ratelimit:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    // Nettoyer les entrées expirées
    await client.zremrangebyscore(key, 0, windowStart);

    // Obtenir le nombre de requêtes et la plus ancienne
    const count = await client.zcard(key);
    const oldest = await client.zrange(key, 0, 0, { withScores: true });

    return {
      count,
      oldestRequest: oldest.length > 0 ? oldest[0].score : null
    };

  } catch (error) {
    console.error('Erreur getRateLimitInfo:', error);
    return { count: 0, oldestRequest: null };
  }
}
