/**
 * API Analyze - Vercel Serverless Function
 * Analyse de fiche de paie via OCR + Claude API
 */

import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@vercel/postgres';
import Tesseract from 'tesseract.js';
import fetch from 'node-fetch';
import { checkRateLimit } from '../lib/rate-limit.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Données de référence 2025
const REFERENCE_DATA = {
  SMIC: {
    horaire_brut: 11.88,
    mensuel_brut_35h: 1801.80
  },
  PASS_NAVIGO: {
    mensuel_toutes_zones: 88.80,
    remboursement_min: 0.50 // 50%
  },
  CSG_CRDS: {
    assiette: 0.9825, // 98.25% du brut
    csg_deductible: 0.068,
    csg_non_deductible: 0.024,
    crds: 0.005,
    total: 0.097
  },
  HEURES_SUP: {
    majoration_25: 0.25, // 36e à 43e heure
    majoration_50: 0.50  // à partir de 44e heure
  },
  PRESCRIPTION_MOIS: 36
};

// Prompt système spécialisé pour analyse TEASER (avant collecte email)
const SYSTEM_PROMPT = `Tu es un expert en droit du travail français et en analyse de bulletins de paie.

**DONNÉES DE RÉFÉRENCE 2025:**
- SMIC horaire brut: 11,88 €
- SMIC mensuel brut (35h): 1 801,80 €
- Pass Navigo mensuel (Île-de-France): 88,80 € → remboursement employeur obligatoire: 50% = 44,40 €
- CSG/CRDS sur salaires: assiette 98,25% du brut, total 9,7%
- Heures supplémentaires: majoration 25% (36e-43e h), 50% (44e+ h)
- Prescription: 3 ans (36 mois)

**Ta mission:**
Analyser le bulletin de paie et détecter les anomalies avec impact financier CERTAIN (C1) ou PROBABLE (C2).

**ÉTAPE 1: Extraction des données**
Extraire du bulletin:
- Période, date d'entrée, ancienneté
- Salaire de base (heures × taux)
- Heures supplémentaires (nombre, taux, majoration)
- Cotisations sociales
- Remboursements (transport)
- Salaire net mensuel
- Convention collective si indiquée

**ÉTAPE 2: Détection des anomalies**
Pour CHAQUE anomalie détectée:
1. Calculer l'écart mensuel en € (valeur attendue - valeur constatée)
2. Classer: C1 (certaine) ou C2 (probable) ou C3 (mineure/formelle)
3. Ne retenir que les C1 et C2 avec impact financier > 5 €/mois

**ÉTAPE 3: Calcul du gain**
\`\`\`
ecart_mensuel_total = somme des écarts C1 et C2
gain_annuel = ecart_mensuel_total × 12
anciennete_mois = calculer depuis date d'entrée
periode_reclamable = MIN(anciennete_mois, 36)
gain_total_potentiel = ecart_mensuel_total × periode_reclamable
\`\`\`

**ÉTAPE 4: Détermination du prix barré**
Basé sur le **gain ANNUEL** (avec 1 bulletin):
- Si gain_annuel ≤ 250 € → prix = 19 €
- Si gain_annuel ≤ 500 € → prix = 39 €
- Si gain_annuel ≤ 1000 € → prix = 89 €
- Si gain_annuel > 1000 € → prix = 149 €

**ÉTAPE 5: Calcul du % du salaire net**
\`\`\`
net_annuel = salaire_net_mensuel × 12
pourcentage_annuel = (gain_annuel / net_annuel) × 100
pourcentage_total = (gain_total_potentiel / net_annuel) × 100
\`\`\`

**Format de réponse attendu (JSON strict):**

{
  "status": "conforme" | "anomalies_detectees" | "probable",
  "nombre_anomalies": 0,
  "gain_mensuel": 0.0,
  "gain_annuel": 0.0,
  "gain_total_potentiel": 0.0,
  "anciennete_mois": 0,
  "periode_reclamable_mois": 0,
  "salaire_net_mensuel": 0.0,
  "pourcentage_salaire_annuel": 0.0,
  "pourcentage_salaire_total": 0.0,
  "prix_rapport": 19 | 39 | 89 | 149,
  "periode_bulletin": "septembre 2025",
  "anomalies_resume": [
    {
      "categorie": "heures_sup" | "transport" | "smic" | "cotisations" | "autre",
      "impact_mensuel": 0.0,
      "certitude": "certaine" | "probable"
    }
  ],
  "message_teaser": "Description factuelle et rassurante de l'anomalie détectée, sans révéler le détail exact"
}

**IMPORTANT:**
- NE PAS révéler quelle ligne est erronée ni comment corriger
- Rester factuel et rassurant dans le message_teaser
- Si aucune anomalie > 5 €/mois → status = "conforme"
- Calculer précisément tous les montants
- Le prix est basé sur gain_annuel, PAS sur gain_total_potentiel`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Rate limiting - max 3 analyses par heure par IP
    // L'analyse Claude est coûteuse, donc limite stricte
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const rateLimitResult = await checkRateLimit(`analyze:${ip}`, 3, 3600000);

    // Ajouter les headers de rate limit
    res.setHeader('X-RateLimit-Limit', 3);
    res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
    res.setHeader('X-RateLimit-Reset', new Date(rateLimitResult.resetAt).toISOString());

    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        error: "Trop d'analyses. Limite: 3 analyses par heure.",
        retryAfter: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)
      });
    }

    const { fileId } = req.body;

    if (!fileId) {
      return res.status(400).json({ error: 'fileId manquant' });
    }

    // Récupération du fichier depuis la DB
    const fileResult = await sql`
      SELECT * FROM files WHERE id = ${fileId} LIMIT 1
    `;

    if (fileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Fichier non trouvé' });
    }

    const file = fileResult.rows[0];

    // Téléchargement du fichier depuis Blob Storage
    const fileResponse = await fetch(file.blob_url);
    const fileBuffer = await fileResponse.buffer();

    // OCR du fichier
    let extractedText = '';

    if (file.file_type === 'application/pdf') {
      // Pour PDF: conversion en images puis OCR
      // Note: nécessite pdf-poppler ou pdf2pic
      const pdf2pic = require('pdf2pic');
      const converter = pdf2pic.fromBuffer(fileBuffer, {
        density: 300,
        format: 'png',
        width: 2000,
        height: 2000
      });

      const pages = await converter.bulk(-1); // toutes les pages

      for (const page of pages) {
        const { data } = await Tesseract.recognize(
          page.base64,
          'fra',
          {
            logger: m => console.log(m)
          }
        );
        extractedText += data.text + '\n';
      }
    } else {
      // Pour images: OCR direct
      const { data } = await Tesseract.recognize(
        fileBuffer,
        'fra',
        {
          logger: m => console.log(m)
        }
      );
      extractedText = data.text;
    }

    console.log('Texte extrait:', extractedText.substring(0, 500));

    // Appel à Claude API pour analyse TEASER
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Analyse ce bulletin de paie français et calcule le gain récupérable.

Texte extrait du bulletin:

${extractedText}

Applique la méthodologie complète:
1. Extraire toutes les données du bulletin
2. Détecter les anomalies C1 et C2
3. Calculer gain mensuel, annuel, et total potentiel
4. Déterminer le prix du rapport selon la grille
5. Calculer les % du salaire net

Réponds UNIQUEMENT avec un objet JSON valide selon le format spécifié.
NE PAS révéler la nature exacte des erreurs dans le message_teaser.`
      }]
    });

    // Parsing de la réponse Claude
    const responseText = message.content[0].text;
    let analysisResult;

    try {
      // Extraction du JSON de la réponse (peut contenir du texte autour)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Aucun JSON trouvé dans la réponse');
      }
    } catch (parseError) {
      console.error('Erreur parsing JSON Claude:', parseError);
      return res.status(500).json({
        error: 'Erreur lors du parsing de la réponse IA',
        rawResponse: responseText
      });
    }

    // Sauvegarde des résultats en DB (format teaser + données complètes pour rapport)
    const analysisRecord = await sql`
      INSERT INTO analyses (
        file_id,
        status,
        nombre_anomalies,
        gain_mensuel,
        gain_annuel,
        gain_total_potentiel,
        anciennete_mois,
        periode_reclamable_mois,
        salaire_net_mensuel,
        pourcentage_salaire_annuel,
        pourcentage_salaire_total,
        prix_rapport,
        periode_bulletin,
        anomalies_resume,
        message_teaser,
        raw_ocr_text,
        analyzed_at,
        report_sent
      )
      VALUES (
        ${fileId},
        ${analysisResult.status},
        ${analysisResult.nombre_anomalies || 0},
        ${analysisResult.gain_mensuel || 0},
        ${analysisResult.gain_annuel || 0},
        ${analysisResult.gain_total_potentiel || 0},
        ${analysisResult.anciennete_mois || 0},
        ${analysisResult.periode_reclamable_mois || 0},
        ${analysisResult.salaire_net_mensuel || 0},
        ${analysisResult.pourcentage_salaire_annuel || 0},
        ${analysisResult.pourcentage_salaire_total || 0},
        ${analysisResult.prix_rapport || 19},
        ${analysisResult.periode_bulletin || ''},
        ${JSON.stringify(analysisResult.anomalies_resume || [])},
        ${analysisResult.message_teaser || ''},
        ${extractedText},
        NOW(),
        false
      )
      RETURNING id
    `;

    const analysisId = analysisRecord.rows[0].id;

    // Réponse TEASER (sans détails des anomalies)
    return res.status(200).json({
      success: true,
      analysisId,
      status: analysisResult.status,
      nombre_anomalies: analysisResult.nombre_anomalies || 0,
      gain_mensuel: analysisResult.gain_mensuel || 0,
      gain_annuel: analysisResult.gain_annuel || 0,
      gain_total_potentiel: analysisResult.gain_total_potentiel || 0,
      anciennete_mois: analysisResult.anciennete_mois || 0,
      periode_reclamable_mois: analysisResult.periode_reclamable_mois || 0,
      pourcentage_salaire_annuel: analysisResult.pourcentage_salaire_annuel || 0,
      pourcentage_salaire_total: analysisResult.pourcentage_salaire_total || 0,
      prix_rapport: analysisResult.prix_rapport || 19,
      periode_bulletin: analysisResult.periode_bulletin || '',
      message_teaser: analysisResult.message_teaser || '',
      anomalies_resume: analysisResult.anomalies_resume || []
    });

  } catch (error) {
    console.error('Erreur analyse:', error);

    // Gestion des erreurs spécifiques Claude API
    if (error.status === 429) {
      return res.status(429).json({
        error: 'Limite de requêtes atteinte. Veuillez réessayer dans quelques instants.'
      });
    }

    if (error.status === 401) {
      return res.status(500).json({
        error: 'Erreur de configuration API'
      });
    }

    return res.status(500).json({
      error: "Erreur serveur lors de l'analyse",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

export const config = {
  maxDuration: 60, // Timeout 60 secondes (analyse peut être longue)
};
