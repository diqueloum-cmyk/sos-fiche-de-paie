/**
 * API Contact - Vercel Serverless Function
 * Gestion du formulaire de contact avec envoi d'email
 */

import { Resend } from 'resend';
import { sql } from '@vercel/postgres';
import { checkRateLimit } from '../lib/rate-limit.js';

const resend = new Resend(process.env.RESEND_API_KEY);

function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function sanitizeInput(text, maxLength = 1000) {
  if (!text) return '';
  return text
    .trim()
    .substring(0, maxLength)
    .replace(/[<>]/g, ''); // Protection basique XSS
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Rate limiting - max 3 messages de contact par heure par IP
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const rateLimitResult = await checkRateLimit(`contact:${ip}`, 3, 3600000);

    // Ajouter les headers de rate limit
    res.setHeader('X-RateLimit-Limit', 3);
    res.setHeader('X-RateLimit-Remaining', rateLimitResult.remaining);
    res.setHeader('X-RateLimit-Reset', new Date(rateLimitResult.resetAt).toISOString());

    if (!rateLimitResult.allowed) {
      return res.status(429).json({
        error: 'Trop de messages. Limite: 3 messages par heure.',
        retryAfter: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)
      });
    }

    // Validation du body
    const { name, email, subject, message, consent } = req.body;

    if (!name || !email || !subject || !message) {
      return res.status(400).json({
        error: 'Tous les champs sont obligatoires'
      });
    }

    if (!consent) {
      return res.status(400).json({
        error: 'Vous devez accepter la politique de confidentialité'
      });
    }

    // Validation de l'email
    if (!validateEmail(email)) {
      return res.status(400).json({
        error: 'Email invalide'
      });
    }

    // Sanitisation des données
    const cleanName = sanitizeInput(name, 100);
    const cleanEmail = sanitizeInput(email, 100);
    const cleanSubject = sanitizeInput(subject, 200);
    const cleanMessage = sanitizeInput(message, 5000);

    if (!cleanName || !cleanEmail || !cleanSubject || !cleanMessage) {
      return res.status(400).json({
        error: 'Données invalides après validation'
      });
    }

    // Enregistrement en DB (optionnel, pour historique)
    await sql`
      INSERT INTO contact_messages (
        name,
        email,
        subject,
        message,
        ip_address,
        created_at
      )
      VALUES (
        ${cleanName},
        ${cleanEmail},
        ${cleanSubject},
        ${cleanMessage},
        ${ip},
        NOW()
      )
    `;

    // Envoi de l'email via Resend
    const emailData = await resend.emails.send({
      from: 'SOS Fiche de Paie <contact@sos-fiche-de-paie.fr>',
      to: ['support@sos-fiche-de-paie.fr'], // Email de destination
      replyTo: cleanEmail,
      subject: `[Contact] ${cleanSubject}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 20px;
              border-radius: 8px 8px 0 0;
            }
            .content {
              background: #f9f9f9;
              padding: 20px;
              border: 1px solid #ddd;
              border-top: none;
            }
            .info-row {
              margin: 10px 0;
            }
            .label {
              font-weight: bold;
              color: #667eea;
            }
            .message-box {
              background: white;
              padding: 15px;
              border-left: 4px solid #667eea;
              margin-top: 15px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>📧 Nouveau message de contact</h2>
            </div>
            <div class="content">
              <div class="info-row">
                <span class="label">De:</span> ${cleanName}
              </div>
              <div class="info-row">
                <span class="label">Email:</span> ${cleanEmail}
              </div>
              <div class="info-row">
                <span class="label">Sujet:</span> ${cleanSubject}
              </div>

              <div class="message-box">
                <p><strong>Message:</strong></p>
                <p>${cleanMessage.replace(/\n/g, '<br>')}</p>
              </div>

              <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">

              <p style="font-size: 12px; color: #666;">
                <strong>IP:</strong> ${ip}<br>
                <strong>Date:</strong> ${new Date().toLocaleString('fr-FR')}
              </p>
            </div>
          </div>
        </body>
        </html>
      `
    });

    // Email de confirmation à l'utilisateur
    await resend.emails.send({
      from: 'SOS Fiche de Paie <contact@sos-fiche-de-paie.fr>',
      to: cleanEmail,
      subject: 'Confirmation de votre message - SOS Fiche de Paie',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px 20px;
              border-radius: 8px 8px 0 0;
              text-align: center;
            }
            .content {
              background: #f9f9f9;
              padding: 30px 20px;
              border: 1px solid #ddd;
              border-top: none;
              border-radius: 0 0 8px 8px;
            }
            .button {
              display: inline-block;
              padding: 12px 24px;
              background: #667eea;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              margin-top: 15px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Message bien reçu !</h1>
            </div>
            <div class="content">
              <p>Bonjour ${cleanName},</p>

              <p>Nous avons bien reçu votre message concernant "<strong>${cleanSubject}</strong>".</p>

              <p>Notre équipe vous répondra dans les plus brefs délais, généralement sous 24 à 48 heures.</p>

              <p>En attendant, n'hésitez pas à explorer nos services:</p>

              <a href="https://sos-fiche-de-paie.fr" class="button">Analyser une fiche de paie</a>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">

              <p style="font-size: 12px; color: #666;">
                Cet email a été envoyé automatiquement, merci de ne pas y répondre.<br>
                Pour toute question, contactez-nous via le formulaire sur notre site.
              </p>
            </div>
          </div>
        </body>
        </html>
      `
    });

    return res.status(200).json({
      success: true,
      message: 'Message envoyé avec succès'
    });

  } catch (error) {
    console.error('Erreur contact:', error);

    // Erreur spécifique Resend
    if (error.name === 'ResendError') {
      return res.status(500).json({
        error: "Erreur lors de l'envoi de l'email"
      });
    }

    return res.status(500).json({
      error: 'Erreur serveur',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
