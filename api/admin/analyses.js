import { sql } from '@vercel/postgres';
import { verifyAdminToken } from '../../lib/admin-auth.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Vérification du token admin
  const authHeader = req.headers['authorization'];
  const token = authHeader?.replace('Bearer ', '');
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  try {
    const offset = Math.max(0, parseInt(req.query.offset) || 0);

    const [result, countResult] = await Promise.all([
      sql`
        SELECT
          a.id,
          a.user_prenom,
          a.user_email,
          a.nombre_anomalies,
          a.gain_mensuel,
          a.gain_annuel,
          a.gain_total_potentiel,
          a.anciennete_mois,
          a.periode_reclamable_mois,
          a.salaire_net_mensuel,
          a.pourcentage_salaire_annuel,
          a.pourcentage_salaire_total,
          a.prix_rapport,
          a.periode_bulletin,
          a.anomalies_resume,
          a.message_teaser,
          a.raw_ocr_text,
          a.status,
          a.report_sent,
          a.report_sent_at,
          a.analyzed_at,
          f.id AS file_id,
          f.file_name,
          f.expires_at,
          f.deleted_at
        FROM analyses a
        LEFT JOIN files f ON a.file_id = f.id
        WHERE a.user_email IS NOT NULL
        ORDER BY a.analyzed_at DESC
        LIMIT 50 OFFSET ${offset}
      `,
      sql`SELECT COUNT(*) as total FROM analyses WHERE user_email IS NOT NULL`
    ]);

    return res.status(200).json({
      analyses: result.rows,
      total: parseInt(countResult.rows[0].total),
      offset
    });
  } catch (error) {
    console.error('Erreur admin/analyses:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
