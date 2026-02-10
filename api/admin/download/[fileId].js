import { sql } from '@vercel/postgres';
import { verifyAdminToken } from '../../../lib/admin-auth.js';

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

  const { fileId } = req.query;

  if (!fileId) {
    return res.status(400).json({ error: 'fileId manquant' });
  }

  try {
    const result = await sql`
      SELECT blob_url, file_name, file_type, expires_at, deleted_at
      FROM files WHERE id = ${fileId} LIMIT 1
    `;

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Fichier non trouvé' });
    }

    const file = result.rows[0];

    // Vérification RGPD : fichier expiré ou supprimé
    if (file.deleted_at || new Date(file.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Fichier expiré ou supprimé (RGPD 30 jours)' });
    }

    // Proxy : télécharger depuis Vercel Blob Storage et renvoyer au client
    const blobResponse = await fetch(file.blob_url);
    if (!blobResponse.ok) {
      return res.status(502).json({ error: 'Erreur lors de la récupération du fichier' });
    }

    const buffer = await blobResponse.arrayBuffer();

    res.setHeader('Content-Type', file.file_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file.file_name}"`);
    res.setHeader('Content-Length', buffer.byteLength);

    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    console.error('Erreur admin/download:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
}
