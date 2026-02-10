/**
 * API Upload - Vercel Serverless Function
 * Gestion de l'upload de fichiers (fiche de paie)
 */

import { put } from '@vercel/blob';
import { sql } from '@vercel/postgres';
import { fileTypeFromBuffer } from 'file-type';
import { checkRateLimit } from '../lib/rate-limit.js';
import formidable from 'formidable';
import fs from 'fs';

// Configuration
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
];

// Mapping des extensions pour file-type
const MIME_TO_EXTENSION = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

export const config = {
  api: {
    bodyParser: false, // Disable Next.js body parser to use formidable
  },
  maxDuration: 30,
};

export default async function handler(req, res) {
  // Autoriser uniquement POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
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

    // Parse multipart form data with Promise wrapper
    const { fields, files } = await new Promise((resolve, reject) => {
      const form = formidable({
        maxFileSize: MAX_FILE_SIZE,
        keepExtensions: true
      });

      form.parse(req, (err, fields, files) => {
        if (err) {
          reject(err);
        } else {
          resolve({ fields, files });
        }
      });
    });

    const file = files.file?.[0] || files.file;

    if (!file) {
      return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

      // Validation de la taille AVANT lecture complète
      if (file.size > MAX_FILE_SIZE) {
        return res.status(400).json({
          error: `Fichier trop volumineux (max: ${MAX_FILE_SIZE / 1024 / 1024}MB)`
        });
      }

      // Lecture du fichier
      const fileBuffer = fs.readFileSync(file.filepath);

      // VALIDATION CRITIQUE: Vérification du MIME type réel (magic bytes)
      // Protection contre les fichiers falsifiés (ex: .exe renommé en .pdf)
      const detectedType = await fileTypeFromBuffer(fileBuffer);

      if (!detectedType) {
        // Fallback pour les PDFs qui peuvent ne pas être détectés
        // Vérifier manuellement les magic bytes du PDF
        const isPDF = fileBuffer.length > 4 &&
                     fileBuffer[0] === 0x25 && // %
                     fileBuffer[1] === 0x50 && // P
                     fileBuffer[2] === 0x44 && // D
                     fileBuffer[3] === 0x46;   // F

        if (!isPDF) {
          fs.unlinkSync(file.filepath); // Nettoyer le fichier temporaire
          return res.status(400).json({
            error: 'Type de fichier non reconnu ou invalide'
          });
        }
      } else {
        // Vérifier que le MIME détecté est dans la liste autorisée
        if (!ALLOWED_MIME_TYPES.includes(detectedType.mime)) {
          fs.unlinkSync(file.filepath); // Nettoyer le fichier temporaire
          return res.status(400).json({
            error: `Type de fichier non autorisé: ${detectedType.mime}. Formats acceptés: PDF, JPG, PNG, WebP`
          });
        }

        // Validation supplémentaire: vérifier que l'extension correspond au MIME
        const expectedExt = MIME_TO_EXTENSION[detectedType.mime];
        if (expectedExt !== detectedType.ext) {
          console.warn(`⚠️  Extension incohérente: détecté=${detectedType.ext}, attendu=${expectedExt}`);
        }
      }

      // Validation du type MIME déclaré (protection secondaire)
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        fs.unlinkSync(file.filepath);
        return res.status(400).json({
          error: 'Type de fichier non autorisé. Formats acceptés: PDF, JPG, PNG, WebP'
        });
      }

      // Upload vers Vercel Blob Storage
      const fileName = `${Date.now()}-${file.originalFilename}`;

      const blob = await put(fileName, fileBuffer, {
        access: 'public',
        contentType: file.mimetype,
      });

      // Enregistrement en base de données
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
          ${file.originalFilename},
          ${file.mimetype},
          ${file.size},
          NOW()
        )
        RETURNING id, blob_url, file_name, uploaded_at
      `;

      const fileRecord = result.rows[0];

      // Nettoyage du fichier temporaire
      fs.unlinkSync(file.filepath);

      // Réponse avec fileId
      return res.status(200).json({
        success: true,
        fileId: fileRecord.id,
        fileName: fileRecord.file_name,
        fileUrl: fileRecord.blob_url,
        uploadedAt: fileRecord.uploaded_at
    });

  } catch (error) {
    console.error('Erreur upload:', error);

    // Si la réponse n'a pas encore été envoyée
    if (!res.headersSent) {
      return res.status(500).json({
        error: "Erreur serveur lors de l'upload",
        message: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
}
