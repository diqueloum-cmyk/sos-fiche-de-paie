/**
 * API Send Report - Vercel Serverless Function
 * Envoi du rapport complet par email après collecte prénom + email
 */

import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@vercel/postgres';
import { Resend } from 'resend';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const resend = new Resend(process.env.RESEND_API_KEY);

// Validation email
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validation prénom
function validatePrenom(prenom) {
  if (!prenom || prenom.length < 2 || prenom.length > 50) return false;
  // Ne doit pas être un email ni contenir des chiffres
  if (prenom.includes('@') || /\d/.test(prenom)) return false;
  return true;
}

// Prompt pour générer le rapport COMPLET avec tous les détails
const RAPPORT_COMPLET_PROMPT = `Tu es un expert en droit du travail français.

Tu as précédemment analysé un bulletin de paie et détecté des anomalies.

Voici les données de l'analyse:
- Texte OCR du bulletin: {OCR_TEXT}
- Résumé des anomalies: {ANOMALIES_RESUME}
- Gain mensuel: {GAIN_MENSUEL} €
- Gain annuel: {GAIN_ANNUEL} €
- Gain total potentiel: {GAIN_TOTAL} €

**Ta mission: Générer un rapport COMPLET avec TOUS les détails.**

Le rapport doit contenir:

## 1. RÉSUMÉ EXÉCUTIF
- Nombre d'anomalies détectées
- Montant récupérable (mensuel, annuel, total sur période)
- % du salaire net annuel

## 2. DÉTAIL DES ANOMALIES
Pour CHAQUE anomalie:
- **Titre de l'anomalie**
- **Ligne concernée** (nom exact tel qu'il apparaît sur le bulletin)
- **Valeur constatée** (montant ou taux lu sur le bulletin)
- **Valeur attendue** (montant ou taux selon la loi/CCN)
- **Calcul de l'écart détaillé** (formule complète)
- **Écart mensuel** (en €)
- **Impact annuel** (écart × 12)
- **Impact total** (écart × période réclamable)
- **Référence légale** (article de loi ou CCN)
- **Explication claire** (pourquoi c'est une erreur)

## 3. MONTANTS CLÉS
- Salaire brut, net avant impôt, net à payer
- Heures travaillées, taux horaire
- Récapitulatif des écarts

## 4. PROCÉDURE DE RÉCLAMATION
- Étapes à suivre
- Délai de prescription (3 ans)
- Documents à joindre
- Conseils pratiques

## 5. LETTRE DE RÉCLAMATION PERSONNALISÉE
Générer une lettre formelle avec:
- Objet clair
- Détail chiffré de chaque anomalie
- Références légales
- Demande de régularisation
- Ton professionnel et factuel

## 6. RÉFÉRENCES LÉGALES
Liste complète des articles de loi et CCN applicables

**Format de réponse attendu (JSON strict):**

{
  "resume_executif": {
    "nombre_anomalies": 0,
    "gain_mensuel": 0.0,
    "gain_annuel": 0.0,
    "gain_total": 0.0,
    "pourcentage_salaire": 0.0
  },
  "anomalies_detaillees": [
    {
      "titre": "...",
      "ligne_concernee": "...",
      "valeur_constatee": "...",
      "valeur_attendue": "...",
      "calcul_ecart": "...",
      "ecart_mensuel": 0.0,
      "impact_annuel": 0.0,
      "impact_total": 0.0,
      "reference_legale": "...",
      "explication": "..."
    }
  ],
  "montants_cles": {
    "salaire_brut": 0.0,
    "salaire_net": 0.0,
    "heures_travaillees": 0.0,
    "taux_horaire": 0.0
  },
  "procedure_reclamation": {
    "etapes": ["...", "..."],
    "delai_prescription": "...",
    "documents_joindre": ["...", "..."],
    "conseils": ["...", "..."]
  },
  "lettre_reclamation": "Texte complet de la lettre...",
  "references_legales": ["...", "..."]
}

Sois exhaustif et précis. C'est le rapport COMPLET que l'utilisateur va recevoir.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { analysisId, prenom, email } = req.body;

    // Validation des données
    if (!analysisId || !prenom || !email) {
      return res.status(400).json({
        error: 'Données manquantes (analysisId, prenom, email requis)'
      });
    }

    if (!validatePrenom(prenom)) {
      return res.status(400).json({
        error: 'Prénom invalide'
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        error: 'Email invalide'
      });
    }

    // Récupération de l'analyse depuis la DB
    const analysisResult = await sql`
      SELECT
        a.*,
        f.file_name,
        f.uploaded_at
      FROM analyses a
      JOIN files f ON a.file_id = f.id
      WHERE a.id = ${analysisId}
      LIMIT 1
    `;

    if (analysisResult.rows.length === 0) {
      return res.status(404).json({ error: 'Analyse non trouvée' });
    }

    const analysis = analysisResult.rows[0];

    // Vérifier que le rapport n'a pas déjà été envoyé
    if (analysis.report_sent) {
      return res.status(200).json({
        success: true,
        message: 'Rapport déjà envoyé à cette adresse',
        already_sent: true
      });
    }

    // Si aucune anomalie, pas besoin de générer un rapport détaillé
    if (analysis.status === 'conforme' || analysis.nombre_anomalies === 0) {
      return res.status(400).json({
        error: 'Aucune anomalie détectée, pas de rapport à envoyer'
      });
    }

    // Générer le rapport COMPLET via Claude
    const promptWithData = RAPPORT_COMPLET_PROMPT
      .replace('{OCR_TEXT}', analysis.raw_ocr_text.substring(0, 3000)) // Limiter pour rester dans le contexte
      .replace('{ANOMALIES_RESUME}', JSON.stringify(analysis.anomalies_resume))
      .replace('{GAIN_MENSUEL}', analysis.gain_mensuel)
      .replace('{GAIN_ANNUEL}', analysis.gain_annuel)
      .replace('{GAIN_TOTAL}', analysis.gain_total_potentiel);

    console.log('Génération du rapport complet via Claude...');

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: promptWithData,
      messages: [{
        role: 'user',
        content: 'Génère le rapport complet avec tous les détails selon le format JSON spécifié.'
      }]
    });

    // Parsing de la réponse
    const responseText = message.content[0].text;
    let rapportComplet;

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        rapportComplet = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Aucun JSON trouvé dans la réponse');
      }
    } catch (parseError) {
      console.error('Erreur parsing JSON rapport:', parseError);
      return res.status(500).json({
        error: 'Erreur lors de la génération du rapport',
        details: process.env.NODE_ENV === 'development' ? parseError.message : undefined
      });
    }

    // Sauvegarde du rapport complet et des infos utilisateur en DB
    await sql`
      UPDATE analyses
      SET
        rapport_complet = ${JSON.stringify(rapportComplet)},
        user_prenom = ${prenom},
        user_email = ${email},
        report_sent = true,
        report_sent_at = NOW()
      WHERE id = ${analysisId}
    `;

    // Enregistrement du lead dans la table dédiée
    await sql`
      INSERT INTO leads (
        prenom,
        email,
        analysis_id,
        gain_total_potentiel,
        prix_rapport,
        source
      )
      VALUES (
        ${prenom},
        ${email},
        ${analysisId},
        ${analysis.gain_total_potentiel},
        ${analysis.prix_rapport},
        'offre_lancement'
      )
      ON CONFLICT DO NOTHING
    `;

    // Génération du HTML pour l'email
    const emailHtml = generateEmailHtml(prenom, analysis, rapportComplet);

    // Envoi de l'email via Resend
    const emailData = await resend.emails.send({
      from: 'SOS Fiche de Paie <contact@sos-fiche-de-paie.fr>',
      to: email,
      subject: `Votre rapport d'analyse - ${Math.round(analysis.gain_total_potentiel)}€ récupérables`,
      html: emailHtml
    });

    console.log('Email envoyé:', emailData.id);

    return res.status(200).json({
      success: true,
      message: 'Rapport envoyé avec succès',
      email_id: emailData.id
    });

  } catch (error) {
    console.error('Erreur send-report:', error);

    if (error.status === 429) {
      return res.status(429).json({
        error: 'Limite de requêtes atteinte. Veuillez réessayer dans quelques instants.'
      });
    }

    return res.status(500).json({
      error: 'Erreur serveur lors de l\'envoi du rapport',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Fonction de génération du HTML de l'email
function generateEmailHtml(prenom, analysis, rapport) {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Votre rapport d'analyse</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 650px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 28px;
    }
    .header p {
      margin: 0;
      font-size: 16px;
      opacity: 0.9;
    }
    .content {
      padding: 40px 30px;
    }
    .montant-box {
      background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
      border-left: 4px solid #667eea;
      padding: 20px;
      margin: 25px 0;
      border-radius: 8px;
    }
    .montant-box h2 {
      margin: 0 0 15px 0;
      color: #667eea;
      font-size: 18px;
    }
    .montant-line {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .montant-line:last-child {
      border-bottom: none;
      font-weight: bold;
      font-size: 18px;
      color: #667eea;
      padding-top: 15px;
    }
    .anomalie {
      background: #f9f9f9;
      border-radius: 8px;
      padding: 20px;
      margin: 20px 0;
    }
    .anomalie h3 {
      margin: 0 0 15px 0;
      color: #333;
      font-size: 16px;
    }
    .detail-line {
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 10px;
      margin: 8px 0;
      font-size: 14px;
    }
    .detail-label {
      font-weight: 600;
      color: #666;
    }
    .detail-value {
      color: #333;
    }
    .lettre-box {
      background: #f0f4ff;
      border: 1px solid #d0d9ff;
      border-radius: 8px;
      padding: 25px;
      margin: 25px 0;
      white-space: pre-wrap;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.8;
    }
    .procedure {
      background: #fff8e1;
      border-left: 4px solid #ffc107;
      padding: 20px;
      margin: 25px 0;
      border-radius: 8px;
    }
    .procedure h3 {
      margin: 0 0 15px 0;
      color: #f57c00;
    }
    .procedure ol {
      margin: 10px 0;
      padding-left: 20px;
    }
    .procedure li {
      margin: 8px 0;
    }
    .references {
      background: #e8f5e9;
      border-left: 4px solid #4caf50;
      padding: 20px;
      margin: 25px 0;
      border-radius: 8px;
    }
    .references h3 {
      margin: 0 0 15px 0;
      color: #2e7d32;
    }
    .references ul {
      margin: 10px 0;
      padding-left: 20px;
    }
    .references li {
      margin: 6px 0;
      font-size: 14px;
    }
    .footer {
      background: #f5f5f5;
      padding: 30px;
      text-align: center;
      font-size: 13px;
      color: #666;
    }
    .button {
      display: inline-block;
      padding: 12px 30px;
      background: #667eea;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      margin: 20px 0;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Votre Rapport d'Analyse</h1>
      <p>SOS Fiche de Paie</p>
    </div>

    <div class="content">
      <p>Bonjour <strong>${prenom}</strong>,</p>

      <p>Voici votre rapport complet d'analyse de bulletin de paie.</p>

      <div class="montant-box">
        <h2>💰 Résumé Exécutif</h2>
        <div class="montant-line">
          <span>Anomalies détectées :</span>
          <span><strong>${rapport.resume_executif.nombre_anomalies}</strong></span>
        </div>
        <div class="montant-line">
          <span>Gain mensuel :</span>
          <span>${rapport.resume_executif.gain_mensuel.toFixed(2)} €</span>
        </div>
        <div class="montant-line">
          <span>Gain annuel :</span>
          <span>${rapport.resume_executif.gain_annuel.toFixed(2)} €</span>
        </div>
        <div class="montant-line">
          <span>Gain total récupérable :</span>
          <span>${rapport.resume_executif.gain_total.toFixed(2)} €</span>
        </div>
      </div>

      <p><em>Ce montant représente environ <strong>${rapport.resume_executif.pourcentage_salaire.toFixed(1)}%</strong> de votre salaire net annuel.</em></p>

      <h2>🔍 Détail des Anomalies</h2>

      ${rapport.anomalies_detaillees.map((anom, idx) => `
        <div class="anomalie">
          <h3>Anomalie ${idx + 1} : ${anom.titre}</h3>

          <div class="detail-line">
            <div class="detail-label">Ligne concernée :</div>
            <div class="detail-value">${anom.ligne_concernee}</div>
          </div>

          <div class="detail-line">
            <div class="detail-label">Valeur constatée :</div>
            <div class="detail-value">${anom.valeur_constatee}</div>
          </div>

          <div class="detail-line">
            <div class="detail-label">Valeur attendue :</div>
            <div class="detail-value">${anom.valeur_attendue}</div>
          </div>

          <div class="detail-line">
            <div class="detail-label">Calcul de l'écart :</div>
            <div class="detail-value">${anom.calcul_ecart}</div>
          </div>

          <div class="detail-line">
            <div class="detail-label">Impact mensuel :</div>
            <div class="detail-value"><strong>${anom.ecart_mensuel.toFixed(2)} €</strong></div>
          </div>

          <div class="detail-line">
            <div class="detail-label">Impact annuel :</div>
            <div class="detail-value"><strong>${anom.impact_annuel.toFixed(2)} €</strong></div>
          </div>

          <div class="detail-line">
            <div class="detail-label">Impact total :</div>
            <div class="detail-value"><strong>${anom.impact_total.toFixed(2)} €</strong></div>
          </div>

          <div class="detail-line">
            <div class="detail-label">Référence légale :</div>
            <div class="detail-value"><em>${anom.reference_legale}</em></div>
          </div>

          <p style="margin-top: 15px; font-size: 14px; color: #555;">
            <strong>Explication :</strong> ${anom.explication}
          </p>
        </div>
      `).join('')}

      <div class="procedure">
        <h3>📋 Procédure de Réclamation</h3>

        <h4>Étapes à suivre :</h4>
        <ol>
          ${rapport.procedure_reclamation.etapes.map(etape => `<li>${etape}</li>`).join('')}
        </ol>

        <p><strong>Délai :</strong> ${rapport.procedure_reclamation.delai_prescription}</p>

        <h4>Documents à joindre :</h4>
        <ul>
          ${rapport.procedure_reclamation.documents_joindre.map(doc => `<li>${doc}</li>`).join('')}
        </ul>

        <h4>Conseils pratiques :</h4>
        <ul>
          ${rapport.procedure_reclamation.conseils.map(conseil => `<li>${conseil}</li>`).join('')}
        </ul>
      </div>

      <h2>✉️ Lettre de Réclamation Personnalisée</h2>
      <p>Voici une lettre type que vous pouvez envoyer à votre employeur :</p>

      <div class="lettre-box">${rapport.lettre_reclamation}</div>

      <div class="references">
        <h3>📚 Références Légales</h3>
        <ul>
          ${rapport.references_legales.map(ref => `<li>${ref}</li>`).join('')}
        </ul>
      </div>

      <p style="margin-top: 40px;">
        <strong>Besoin d'aide ?</strong> N'hésitez pas à nous contacter si vous avez des questions.
      </p>

      <a href="https://sos-fiche-de-paie.fr/contact" class="button">Nous contacter</a>
    </div>

    <div class="footer">
      <p><strong>SOS Fiche de Paie</strong></p>
      <p>Ce rapport a été généré automatiquement le ${new Date().toLocaleDateString('fr-FR')}.</p>
      <p style="margin-top: 15px; font-size: 12px;">
        Ce document ne constitue pas un avis juridique. Pour toute action légale,<br>
        consultez un avocat spécialisé en droit du travail.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

export const config = {
  maxDuration: 60,
};
