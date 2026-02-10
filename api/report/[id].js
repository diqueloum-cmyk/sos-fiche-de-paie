/**
 * API Report - Vercel Serverless Function
 * Génération et téléchargement de rapport PDF d'analyse
 */

import { sql } from '@vercel/postgres';
import PDFDocument from 'pdfkit';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "ID d'analyse manquant" });
    }

    // Récupération de l'analyse depuis la DB
    const analysisResult = await sql`
      SELECT
        a.*,
        f.file_name,
        f.uploaded_at
      FROM analyses a
      JOIN files f ON a.file_id = f.id
      WHERE a.id = ${id}
      LIMIT 1
    `;

    if (analysisResult.rows.length === 0) {
      return res.status(404).json({ error: 'Analyse non trouvée' });
    }

    const analysis = analysisResult.rows[0];
    const anomalies = JSON.parse(analysis.anomalies || '[]');
    const montants = JSON.parse(analysis.montants_cles || '{}');
    const recommandations = JSON.parse(analysis.recommandations || '[]');
    const references = JSON.parse(analysis.references_legales || '[]');

    // Création du PDF avec PDFKit
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `Rapport d'analyse - ${analysis.file_name}`,
        Author: 'SOS Fiche de Paie',
        Subject: 'Analyse de fiche de paie',
        Keywords: 'fiche de paie, analyse, anomalies'
      }
    });

    // Stream le PDF directement dans la réponse
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="rapport-analyse-${id}.pdf"`
    );

    doc.pipe(res);

    // === EN-TÊTE ===
    doc
      .fontSize(24)
      .fillColor('#667eea')
      .text('SOS Fiche de Paie', { align: 'center' });

    doc
      .fontSize(16)
      .fillColor('#333')
      .text('Rapport d\'analyse', { align: 'center' })
      .moveDown(2);

    // === INFORMATIONS GÉNÉRALES ===
    doc
      .fontSize(14)
      .fillColor('#667eea')
      .text('Informations générales', { underline: true })
      .moveDown(0.5);

    doc
      .fontSize(11)
      .fillColor('#333')
      .text(`Fichier analysé: ${analysis.file_name}`)
      .text(`Date d'upload: ${new Date(analysis.uploaded_at).toLocaleDateString('fr-FR')}`)
      .text(`Date d'analyse: ${new Date(analysis.analyzed_at).toLocaleDateString('fr-FR')}`)
      .moveDown(1);

    // === SCORE DE CONFORMITÉ ===
    const scoreColor = analysis.score_conformite >= 80 ? '#10b981' :
                       analysis.score_conformite >= 50 ? '#f59e0b' : '#ef4444';

    doc
      .fontSize(14)
      .fillColor('#667eea')
      .text('Score de conformité', { underline: true })
      .moveDown(0.5);

    doc
      .fontSize(32)
      .fillColor(scoreColor)
      .text(`${analysis.score_conformite}/100`, { align: 'center' })
      .moveDown(1);

    doc
      .fontSize(12)
      .fillColor('#333')
      .text(`Statut: ${analysis.status === 'conforme' ? '✓ Conforme' : '⚠ Anomalies détectées'}`, {
        align: 'center'
      })
      .moveDown(2);

    // === MONTANTS CLÉS ===
    if (Object.keys(montants).length > 0) {
      doc
        .fontSize(14)
        .fillColor('#667eea')
        .text('Montants clés', { underline: true })
        .moveDown(0.5);

      doc.fontSize(11).fillColor('#333');

      if (montants.salaire_brut) {
        doc.text(`Salaire brut: ${montants.salaire_brut.toFixed(2)} €`);
      }
      if (montants.salaire_net_avant_impot) {
        doc.text(`Salaire net avant impôt: ${montants.salaire_net_avant_impot.toFixed(2)} €`);
      }
      if (montants.salaire_net) {
        doc.text(`Salaire net: ${montants.salaire_net.toFixed(2)} €`);
      }
      if (montants.heures_travaillees) {
        doc.text(`Heures travaillées: ${montants.heures_travaillees}h`);
      }
      if (montants.taux_horaire) {
        doc.text(`Taux horaire: ${montants.taux_horaire.toFixed(2)} €/h`);
      }

      doc.moveDown(2);
    }

    // === ANOMALIES DÉTECTÉES ===
    if (anomalies.length > 0) {
      doc
        .fontSize(14)
        .fillColor('#667eea')
        .text('Anomalies détectées', { underline: true })
        .moveDown(0.5);

      anomalies.forEach((anomalie, index) => {
        const typeColor = anomalie.type === 'critique' ? '#ef4444' :
                         anomalie.type === 'importante' ? '#f59e0b' : '#3b82f6';

        const typeIcon = anomalie.type === 'critique' ? '🔴' :
                        anomalie.type === 'importante' ? '🟠' : '🔵';

        doc
          .fontSize(12)
          .fillColor(typeColor)
          .text(`${typeIcon} ${anomalie.titre}`, { bold: true })
          .moveDown(0.3);

        doc
          .fontSize(10)
          .fillColor('#666')
          .text(`Catégorie: ${anomalie.categorie}`)
          .text(`Description: ${anomalie.description}`, {
            width: 500,
            align: 'justify'
          });

        if (anomalie.montant_impact) {
          doc
            .fillColor('#ef4444')
            .text(`Impact financier: ${anomalie.montant_impact.toFixed(2)} €`, { bold: true });
        }

        doc.moveDown(1);

        // Nouvelle page si nécessaire
        if (doc.y > 700 && index < anomalies.length - 1) {
          doc.addPage();
        }
      });

      doc.moveDown(1);
    } else {
      doc
        .fontSize(12)
        .fillColor('#10b981')
        .text('✓ Aucune anomalie détectée', { align: 'center' })
        .moveDown(2);
    }

    // === RECOMMANDATIONS ===
    if (recommandations.length > 0) {
      if (doc.y > 600) {
        doc.addPage();
      }

      doc
        .fontSize(14)
        .fillColor('#667eea')
        .text('Recommandations', { underline: true })
        .moveDown(0.5);

      doc.fontSize(11).fillColor('#333');

      recommandations.forEach((reco, index) => {
        doc.text(`${index + 1}. ${reco}`, {
          width: 500,
          align: 'justify'
        }).moveDown(0.5);
      });

      doc.moveDown(1);
    }

    // === RÉFÉRENCES LÉGALES ===
    if (references.length > 0) {
      if (doc.y > 650) {
        doc.addPage();
      }

      doc
        .fontSize(14)
        .fillColor('#667eea')
        .text('Références légales', { underline: true })
        .moveDown(0.5);

      doc.fontSize(9).fillColor('#666');

      references.forEach(ref => {
        doc.text(`• ${ref}`).moveDown(0.3);
      });

      doc.moveDown(1);
    }

    // === PIED DE PAGE ===
    doc
      .fontSize(8)
      .fillColor('#999')
      .text(
        `Ce rapport a été généré automatiquement le ${new Date().toLocaleDateString('fr-FR')} par SOS Fiche de Paie.`,
        50,
        doc.page.height - 80,
        { align: 'center', width: 500 }
      )
      .text(
        'Ce document ne constitue pas un avis juridique. Consultez un avocat spécialisé pour toute action légale.',
        { align: 'center', width: 500 }
      );

    // Finaliser le PDF
    doc.end();

  } catch (error) {
    console.error('Erreur génération rapport:', error);

    // Si le PDF a déjà commencé à être envoyé, on ne peut plus changer les headers
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Erreur lors de la génération du rapport',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

export const config = {
  maxDuration: 30,
};
