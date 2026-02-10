/**
 * API Send Report - Vercel Serverless Function
 * Envoi du rapport par email après collecte prénom + email
 * Construit le rapport directement depuis les données d'analyse en DB (pas d'appel Claude)
 */

import { sql } from '@vercel/postgres';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Validation email
function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validation prénom
function validatePrenom(prenom) {
  if (!prenom || prenom.length < 2 || prenom.length > 50) return false;
  if (prenom.includes('@') || /\d/.test(prenom)) return false;
  return true;
}

// Construire le rapport à partir des données d'analyse existantes
function buildRapportFromAnalysis(analysis) {
  const anomalies = analysis.anomalies_resume || [];
  const gainMensuel = Number(analysis.gain_mensuel) || 0;
  const gainAnnuel = Number(analysis.gain_annuel) || 0;
  const gainTotal = Number(analysis.gain_total_potentiel) || 0;
  const salaireNet = Number(analysis.salaire_net_mensuel) || 0;
  const netAnnuel = salaireNet * 12;
  const pourcentage = netAnnuel > 0 ? (gainAnnuel / netAnnuel) * 100 : 0;
  const periodeReclamable = Number(analysis.periode_reclamable_mois) || 36;

  const categorieLabels = {
    heures_sup: 'Heures supplementaires',
    transport: 'Remboursement transport',
    smic: 'Respect du SMIC',
    cotisations: 'Cotisations sociales',
    autre: 'Autre anomalie'
  };

  const categorieReferences = {
    heures_sup: 'Article L3121-28 du Code du travail - Majoration des heures supplementaires',
    transport: 'Article L3261-2 du Code du travail - Prise en charge obligatoire des frais de transport',
    smic: 'Article L3231-2 du Code du travail - Salaire minimum de croissance',
    cotisations: 'Articles L241-1 et suivants du Code de la securite sociale',
    autre: 'Code du travail - Dispositions applicables'
  };

  const anomaliesDetaillees = anomalies.map(anom => {
    const cat = anom.categorie || 'autre';
    const impact = Number(anom.impact_mensuel) || 0;
    return {
      titre: categorieLabels[cat] || categorieLabels.autre,
      ligne_concernee: cat === 'transport' ? 'Remboursement transport / Pass Navigo' :
                       cat === 'heures_sup' ? 'Heures supplementaires' :
                       cat === 'smic' ? 'Salaire de base' :
                       cat === 'cotisations' ? 'Cotisations salariales' : 'Voir bulletin',
      valeur_constatee: 'Voir bulletin de paie',
      valeur_attendue: 'Selon la reglementation en vigueur',
      calcul_ecart: `Ecart constate : ${impact.toFixed(2)} euros/mois`,
      ecart_mensuel: impact,
      impact_annuel: impact * 12,
      impact_total: impact * periodeReclamable,
      reference_legale: categorieReferences[cat] || categorieReferences.autre,
      explication: anom.certitude === 'certaine'
        ? 'Anomalie certaine detectee sur votre bulletin de paie. L\'ecart est clairement identifiable.'
        : 'Anomalie probable detectee. Une verification approfondie avec vos documents est recommandee.'
    };
  });

  return {
    resume_executif: {
      nombre_anomalies: Number(analysis.nombre_anomalies) || anomalies.length,
      gain_mensuel: gainMensuel,
      gain_annuel: gainAnnuel,
      gain_total: gainTotal,
      pourcentage_salaire: pourcentage
    },
    anomalies_detaillees: anomaliesDetaillees,
    montants_cles: {
      salaire_net: salaireNet,
      periode_bulletin: analysis.periode_bulletin || '',
      anciennete_mois: Number(analysis.anciennete_mois) || 0,
      periode_reclamable: periodeReclamable
    },
    procedure_reclamation: {
      etapes: [
        'Rassemblez tous vos bulletins de paie des 3 dernieres annees',
        'Redigez un courrier de reclamation a votre employeur (modele ci-dessous)',
        'Envoyez le courrier en recommande avec accuse de reception',
        'Conservez une copie de tous les documents envoyes',
        'En l\'absence de reponse sous 1 mois, contactez l\'inspection du travail'
      ],
      delai_prescription: '3 ans (article L3245-1 du Code du travail)',
      documents_joindre: [
        'Copie de vos bulletins de paie concernés',
        'Copie de votre contrat de travail',
        'Le courrier de reclamation en recommande AR',
        'Tout justificatif utile (attestation transport, convention collective...)'
      ],
      conseils: [
        'Gardez un ton factuel et professionnel dans votre courrier',
        'Citez les references legales precisement',
        'Demandez une regularisation dans un delai raisonnable (1 mois)',
        'Conservez tous les echanges ecrits avec votre employeur'
      ]
    },
    lettre_reclamation: generateLettre(analysis, anomaliesDetaillees, gainMensuel, gainTotal),
    references_legales: [
      ...new Set(anomaliesDetaillees.map(a => a.reference_legale)),
      'Article L3245-1 du Code du travail - Prescription triennale des salaires',
      'Article R3243-1 du Code du travail - Mentions obligatoires du bulletin de paie'
    ]
  };
}

function generateLettre(analysis, anomalies, gainMensuel, gainTotal) {
  const detailAnomalies = anomalies.map((a, i) =>
    `${i + 1}. ${a.titre} : ecart mensuel de ${a.ecart_mensuel.toFixed(2)} euros (${a.reference_legale})`
  ).join('\n');

  return `Objet : Reclamation relative a des erreurs sur mon bulletin de paie

Madame, Monsieur,

Je me permets de vous adresser ce courrier afin de porter a votre attention des anomalies que j'ai constatees sur mon bulletin de paie de ${analysis.periode_bulletin || '[periode]'}.

Apres verification approfondie, les irregularites suivantes ont ete identifiees :

${detailAnomalies}

Le montant total de l'ecart mensuel s'eleve a ${gainMensuel.toFixed(2)} euros, soit un prejudice potentiel de ${gainTotal.toFixed(2)} euros sur la periode reclamable.

Conformement aux dispositions du Code du travail, je vous demande de bien vouloir proceder a la regularisation de ma situation dans un delai d'un mois a compter de la reception de ce courrier.

Je reste a votre disposition pour tout echange complementaire.

Veuillez agreer, Madame, Monsieur, l'expression de mes salutations distinguees.`;
}

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
      return res.status(400).json({ error: 'Prénom invalide' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Email invalide' });
    }

    // Récupération de l'analyse et du fichier depuis la DB
    const analysisResult = await sql`
      SELECT
        a.*,
        f.file_name,
        f.blob_url,
        f.file_type,
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

    // Construire le rapport directement depuis les données d'analyse
    console.log('Construction du rapport depuis les données d\'analyse...');
    const rapportComplet = buildRapportFromAnalysis(analysis);

    // Sauvegarde du rapport et enregistrement du lead en parallèle
    await Promise.all([
      sql`
        UPDATE analyses
        SET
          rapport_complet = ${JSON.stringify(rapportComplet)},
          user_prenom = ${prenom},
          user_email = ${email},
          report_sent = true,
          report_sent_at = NOW()
        WHERE id = ${analysisId}
      `,
      sql`
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
      `
    ]);

    // Génération du HTML pour l'email
    const emailHtml = generateEmailHtml(prenom, email, analysis, rapportComplet);

    // Envoi de l'email via Resend
    const emailData = await resend.emails.send({
      from: 'SOS Fiche de Paie <onboarding@resend.dev>',
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
      error: "Erreur serveur lors de l'envoi du rapport"
    });
  }
}

// Fonction de génération du HTML de l'email
function generateEmailHtml(prenom, email, analysis, rapport) {
  const safe = (val, decimals = 2) => {
    const num = Number(val);
    return isNaN(num) ? '0.00' : num.toFixed(decimals);
  };

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
    .header h1 { margin: 0 0 10px 0; font-size: 28px; }
    .header p { margin: 0; font-size: 16px; opacity: 0.9; }
    .content { padding: 40px 30px; }
    .montant-box {
      background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
      border-left: 4px solid #667eea;
      padding: 20px;
      margin: 25px 0;
      border-radius: 8px;
    }
    .montant-box h2 { margin: 0 0 15px 0; color: #667eea; font-size: 18px; }
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
    .anomalie h3 { margin: 0 0 15px 0; color: #333; font-size: 16px; }
    .detail-line {
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 10px;
      margin: 8px 0;
      font-size: 14px;
    }
    .detail-label { font-weight: 600; color: #666; }
    .detail-value { color: #333; }
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
    .procedure h3 { margin: 0 0 15px 0; color: #f57c00; }
    .procedure ol { margin: 10px 0; padding-left: 20px; }
    .procedure li { margin: 8px 0; }
    .references {
      background: #e8f5e9;
      border-left: 4px solid #4caf50;
      padding: 20px;
      margin: 25px 0;
      border-radius: 8px;
    }
    .references h3 { margin: 0 0 15px 0; color: #2e7d32; }
    .references ul { margin: 10px 0; padding-left: 20px; }
    .references li { margin: 6px 0; font-size: 14px; }
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
      <h1>Votre Rapport d'Analyse</h1>
      <p>SOS Fiche de Paie</p>
    </div>

    <div class="content">
      <p>Bonjour <strong>${prenom}</strong>,</p>
      <p style="font-size: 14px; color: #666;">Rapport envoyé à : <strong>${email}</strong></p>

      <p>Voici votre rapport complet d'analyse de bulletin de paie.</p>

      <div class="montant-box">
        <h2>Resume Executif</h2>
        <div class="montant-line">
          <span>Anomalies detectees :</span>
          <span><strong>${rapport.resume_executif?.nombre_anomalies || 0}</strong></span>
        </div>
        <div class="montant-line">
          <span>Gain mensuel :</span>
          <span>${safe(rapport.resume_executif?.gain_mensuel)} euros</span>
        </div>
        <div class="montant-line">
          <span>Gain annuel :</span>
          <span>${safe(rapport.resume_executif?.gain_annuel)} euros</span>
        </div>
        <div class="montant-line">
          <span>Gain total recuperable :</span>
          <span>${safe(rapport.resume_executif?.gain_total)} euros</span>
        </div>
      </div>

      <p><em>Ce montant represente environ <strong>${safe(rapport.resume_executif?.pourcentage_salaire, 1)}%</strong> de votre salaire net annuel.</em></p>

      <h2>Detail des Anomalies</h2>

      ${(rapport.anomalies_detaillees || []).map((anom, idx) => `
        <div class="anomalie">
          <h3>Anomalie ${idx + 1} : ${anom.titre || ''}</h3>

          <div class="detail-line">
            <div class="detail-label">Ligne concernee :</div>
            <div class="detail-value">${anom.ligne_concernee || ''}</div>
          </div>

          <div class="detail-line">
            <div class="detail-label">Valeur constatee :</div>
            <div class="detail-value">${anom.valeur_constatee || ''}</div>
          </div>

          <div class="detail-line">
            <div class="detail-label">Valeur attendue :</div>
            <div class="detail-value">${anom.valeur_attendue || ''}</div>
          </div>

          <div class="detail-line">
            <div class="detail-label">Calcul de l'ecart :</div>
            <div class="detail-value">${anom.calcul_ecart || ''}</div>
          </div>

          <div class="detail-line">
            <div class="detail-label">Impact mensuel :</div>
            <div class="detail-value"><strong>${safe(anom.ecart_mensuel)} euros</strong></div>
          </div>

          <div class="detail-line">
            <div class="detail-label">Impact annuel :</div>
            <div class="detail-value"><strong>${safe(anom.impact_annuel)} euros</strong></div>
          </div>

          <div class="detail-line">
            <div class="detail-label">Impact total :</div>
            <div class="detail-value"><strong>${safe(anom.impact_total)} euros</strong></div>
          </div>

          <div class="detail-line">
            <div class="detail-label">Reference legale :</div>
            <div class="detail-value"><em>${anom.reference_legale || ''}</em></div>
          </div>

          <p style="margin-top: 15px; font-size: 14px; color: #555;">
            <strong>Explication :</strong> ${anom.explication || ''}
          </p>
        </div>
      `).join('')}

      <div class="procedure">
        <h3>Procedure de Reclamation</h3>

        <h4>Etapes a suivre :</h4>
        <ol>
          ${(rapport.procedure_reclamation?.etapes || []).map(etape => `<li>${etape}</li>`).join('')}
        </ol>

        <p><strong>Delai :</strong> ${rapport.procedure_reclamation?.delai_prescription || '3 ans'}</p>

        <h4>Documents a joindre :</h4>
        <ul>
          ${(rapport.procedure_reclamation?.documents_joindre || []).map(doc => `<li>${doc}</li>`).join('')}
        </ul>

        <h4>Conseils pratiques :</h4>
        <ul>
          ${(rapport.procedure_reclamation?.conseils || []).map(conseil => `<li>${conseil}</li>`).join('')}
        </ul>
      </div>

      <h2>Lettre de Reclamation Personnalisee</h2>
      <p>Voici une lettre type que vous pouvez envoyer a votre employeur :</p>

      <div class="lettre-box">${rapport.lettre_reclamation || ''}</div>

      <div class="references">
        <h3>References Legales</h3>
        <ul>
          ${(rapport.references_legales || []).map(ref => `<li>${ref}</li>`).join('')}
        </ul>
      </div>

      <p style="margin-top: 40px;">
        <strong>Besoin d'aide ?</strong> N'hesitez pas a nous contacter si vous avez des questions.
      </p>

      <a href="https://sos-fiche-de-paie.vercel.app/contact" class="button">Nous contacter</a>
    </div>

    <div class="footer">
      <p><strong>SOS Fiche de Paie</strong></p>
      <p>Ce rapport a ete genere automatiquement le ${new Date().toLocaleDateString('fr-FR')}.</p>
      <p style="margin-top: 15px; font-size: 12px;">
        Ce document ne constitue pas un avis juridique. Pour toute action legale,<br>
        consultez un avocat specialise en droit du travail.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}
