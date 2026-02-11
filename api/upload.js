/**
 * API Upload - Vercel Serverless Function
 * Gestion de l'upload de fichiers (fiche de paie)
 */

import { put } from '@vercel/blob';
import { sql } from '@vercel/postgres';
import { fileTypeFromBuffer } from 'file-type';
import { checkRateLimit } from '../lib/rate-limit.js';
import Busboy from 'busboy';

// Configuration
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
];

export default async function handler(req, res) {
  // Autoriser uniquement POST
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Vérifier les variables d'environnement critiques
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('BLOB_READ_WRITE_TOKEN manquant');
    return res.status(500).json({ error: 'Configuration serveur incomplète (storage)' });
  }

  try {
    // Rate limiting - max 5 uploads par heure par IP
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const rateLimitResult = await checkRateLimit(`upload:${ip}`, 5, 3600000);

    // Ajouter les headers de rate limit
    res.setHeader('X-RateLimit-Limit', 5);
    res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
    res.setHeader('X-RateLimit-Reset', new Date(rateLimitResult.resetAt).toISOString());

    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        error: "Trop d'uploads. Limite: 5 fichiers par heure.",
        retryAfter: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)
      });
    }

    // Récupération du fichier depuis FormData
    const contentType = req.headers['content-type'];

    if (!contentType || !contentType.includes('multipart/form-data')) {
      return res.status(400).json({
        error: 'Content-Type doit être multipart/form-data'
      });
    }

    // Parse multipart avec busboy (compatible Vercel serverless)
    const { fileBuffer, originalFilename, mimetype, fileSize } = await parseMultipart(req);

    if (!fileBuffer) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    // Validation de la taille
    if (fileSize > MAX_FILE_SIZE) {
      return res.status(400).json({
        error: `Fichier trop volumineux (max: ${MAX_FILE_SIZE / 1024 / 1024}MB)`
      });
    }

    // VALIDATION CRITIQUE: Vérification du MIME type réel (magic bytes)
    const detectedType = await fileTypeFromBuffer(fileBuffer);

    let isValidFile = false;
    let detectedMimeType = null;

    if (!detectedType) {
      // Fallback pour les PDFs qui peuvent ne pas être détectés
      const isPDF = fileBuffer.length > 4 &&
                   fileBuffer[0] === 0x25 && // %
                   fileBuffer[1] === 0x50 && // P
                   fileBuffer[2] === 0x44 && // D
                   fileBuffer[3] === 0x46;   // F

      if (isPDF) {
        isValidFile = true;
        detectedMimeType = 'application/pdf';
      }
    } else {
      if (ALLOWED_MIME_TYPES.includes(detectedType.mime)) {
        isValidFile = true;
        detectedMimeType = detectedType.mime;
      }
    }

    if (!isValidFile) {
      return res.status(400).json({
        error: 'Format de fichier non autorisé. Formats acceptés: PDF, JPG, PNG'
      });
    }

    console.log(`Fichier accepté: ${originalFilename}, type détecté: ${detectedMimeType}, type déclaré: ${mimetype}`);

    // Upload vers Vercel Blob Storage
    const fileName = `${Date.now()}-${originalFilename}`;

    const blob = await put(fileName, fileBuffer, {
      access: 'public',
      contentType: detectedMimeType,
    });

    // Enregistrement en base de données (stocker le type détecté, pas le type déclaré)
    const result = await sql`
      INSERT INTO files (
        blob_url,
        file_name,
        file_type,
        file_size,
        uploaded_at
      )
      VALUES (
        ${blob.url},
        ${originalFilename},
        ${detectedMimeType},
        ${fileSize},
        NOW()
      )
      RETURNING id, blob_url, file_name, uploaded_at
    `;

    const fileRecord = result.rows[0];

    // Réponse avec fileId
    return res.status(200).json({
      success: true,
      fileId: fileRecord.id,
      fileName: fileRecord.file_name,
      fileUrl: fileRecord.blob_url,
      uploadedAt: fileRecord.uploaded_at
    });

  } catch (error) {
    console.error('Erreur upload:', error.message, error.stack);

    if (!res.headersSent) {
      return res.status(500).json({
        error: "Erreur serveur lors de l'upload",
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
}

/**
 * Parse multipart/form-data avec busboy (compatible Vercel serverless)
 * Contrairement à formidable, busboy n'a pas besoin d'écrire sur disque
 * et fonctionne directement avec le stream de la requête.
 */
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    let fileBuffer = null;
    let originalFilename = '';
    let mimetype = '';
    let fileSize = 0;
    const chunks = [];

    const busboy = Busboy({
      headers: req.headers,
      limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1
      }
    });

    busboy.on('file', (fieldname, stream, info) => {
      const { filename, mimeType } = info;
      originalFilename = filename;
      mimetype = mimeType;

      stream.on('data', (chunk) => {
        chunks.push(chunk);
        fileSize += chunk.length;
      });

      stream.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    busboy.on('finish', () => {
      resolve({ fileBuffer, originalFilename, mimetype, fileSize });
    });

    busboy.on('error', (err) => {
      reject(err);
    });

    req.pipe(busboy);
  });
}
