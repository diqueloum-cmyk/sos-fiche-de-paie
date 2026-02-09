/**
 * API Route CRON Vercel pour le nettoyage automatique
 * À configurer dans Vercel Dashboard > Settings > Cron Jobs
 *
 * Schedule recommandé : 0 2 * * * (tous les jours à 2h du matin)
 */

import cleanupExpiredData from '../../scripts/cleanup-expired-files.js';

export const config = {
  runtime: 'nodejs',
  maxDuration: 300 // 5 minutes max
};

export default async function handler(req, res) {
  // Vérifier que la requête vient bien de Vercel CRON
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid CRON secret'
    });
  }

  try {
    console.log('🔄 CRON cleanup triggered');

    const result = await cleanupExpiredData();

    return res.status(200).json({
      success: true,
      message: 'Cleanup completed successfully',
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('CRON cleanup error:', error);

    return res.status(500).json({
      success: false,
      error: 'Cleanup failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
