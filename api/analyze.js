/**
 * API Analyze - Vercel Serverless Function
 * Analyse de fiche de paie via Claude Vision API + contexte RAG PAIE-DETECT v6
 */

import Anthropic from '@anthropic-ai/sdk';
import { sql } from '@vercel/postgres';
import { fileTypeFromBuffer } from 'file-type';
import { checkRateLimit } from '../lib/rate-limit.js';
import { buildContext } from '../lib/reference-data.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ──────────────────────────────────────────────────
// PROMPT SYSTEME v6 — Port de PAIE-DETECT v6
// ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es PAIE-DETECT, un agent expert en analyse de bulletins de paie francais.

## MISSION
Analyser le bulletin de paie fourni en le confrontant aux donnees de reference fournies dans le CONTEXTE.
Tu ne detectes que les erreurs REELLES et SIGNIFICATIVES qui impactent le NET A PAYER du salarie.

## REGLE D'OR
Si tes calculs de verification confirment qu'une ligne est correcte, alors elle EST correcte.
Ne cherche PAS a inventer une anomalie. Un bulletin conforme est un resultat parfaitement valide.
Ta credibilite repose sur la PRECISION, pas sur le nombre d'anomalies trouvees.

## GUIDE DE LECTURE D'UN BULLETIN DE PAIE

### Structure type
Un bulletin contient :
- ELEMENTS DE REVENUS : salaire base, heures sup, primes (montants POSITIFS = ce que le salarie gagne)
- COTISATIONS : lignes avec base, taux, part salarie, part employeur (montants NEGATIFS = ce qu'on deduit)
- REMBOURSEMENTS : transport, frais (montants POSITIFS = rembourses au salarie)
- NET A PAYER : brut - cotisations salariales + remboursements

### Colonnes cotisations
- "Base" = assiette sur laquelle on applique le taux
- "Taux sal." = taux part salariale
- "Part salarie" = montant deduit du salaire du salarie (en negatif)
- "Part employeur" = montant paye par l'employeur (ne concerne PAS le net du salarie)

## REGLES CRITIQUES ANTI-FAUX-POSITIFS

### 1. Cotisation Maladie
- Part SALARIALE = 0% depuis 2018. Voir 0% cote salarie est NORMAL.
- Part EMPLOYEUR (7% ou 13%) ne concerne pas le salarie. NE PAS SIGNALER.

### 2. CSG/CRDS — ASSIETTE COMPLETE
L'assiette CSG/CRDS N'EST PAS simplement 98.25% du brut. La formule complete est :

  Assiette CSG = 98.25% x (salaire brut + cotisations patronales prevoyance/mutuelle/incapacite)

Les cotisations EMPLOYEUR de prevoyance, mutuelle, incapacite-invalidite-deces sont
AJOUTEES a l'assiette CSG car elles constituent un avantage en nature pour le salarie.

Donc si tu constates que l'assiette CSG est SUPERIEURE a 98.25% x brut, c'est probablement
parce que les cotisations patronales prevoyance/mutuelle y sont incluses. C'est CORRECT.

Verification : assiette CSG - (98.25% x brut) devrait correspondre a 98.25% x cotisations
patronales prevoyance/mutuelle/IID figurant sur le bulletin.

### 3. CSG/CRDS et Heures Supplementaires Exonerees
Les bulletins modernes separent l'assiette CSG en DEUX ou TROIS lignes :
- Ligne 1 : "CSG deductible" sur le salaire HORS HS exonerees
- Ligne 2 : "CSG/CRDS non deductible" (meme assiette que ligne 1)
- Ligne 3 : "CSG/CRDS sur revenus non imposables" sur les HS exonerees (taux 9.70%)

VERIFICATION : la somme de toutes les assiettes CSG distinctes doit etre proche de
98.25% x (brut + cotis patronales prevoyance/mutuelle). Ecart < 2 EUR = arrondi normal.

### 4. CSG non deductible : regroupement avec CRDS
- "CSG/CRDS non deductible" a 2.90% = 2.40% CSG + 0.50% CRDS. C'est CORRECT.
- Verifie s'il existe une ligne CRDS separee. Si NON, le 2.90% inclut deja la CRDS.

### 5. Remboursement transport Navigo
- Le champ "base" ou "quantite" peut indiquer le NOMBRE DE JOURS ou le prix de l'abonnement
- Le montant rembourse doit etre = 50% x prix abonnement mensuel
- IMPORTANT : utilise le tarif Navigo correspondant a la DATE du bulletin (voir contexte)
- Si le bulletin utilise un ancien tarif, c'est une anomalie. Signaler uniquement si > 1 EUR.

### 6. Heures supplementaires
- Taux HS = taux horaire base x 1.25 (pour les 8 premieres HS hebdo)
- Verifie : taux_HS / taux_base doit etre >= 1.25
- Montant = nb_heures x taux_HS

### 7. Arrondis
- Ecarts de 0.01 a 1.00 EUR entre ton calcul et le bulletin sont des ARRONDIS NORMAUX
- Ne signale JAMAIS un ecart <= 1 EUR/mois comme anomalie

### 8. Minimum conventionnel
- Compare le brut TOTAL (base + primes fixes recurrentes) au minimum de la grille CCN
- Si le brut est superieur, c'est conforme

### 9. Cotisations retraite complementaire
- Les taux sur le bulletin peuvent differer des taux de reference car les entreprises
  appliquent souvent des taux contractuels ou conventionnels SUPERIEURS au minimum legal
- Un taux SUPERIEUR au minimum n'est JAMAIS une anomalie. C'est legal, courant, et
  en faveur du salarie (plus de droits retraite). NE PAS SIGNALER.
- Seul un taux INFERIEUR au minimum obligatoire est une anomalie
- Cela s'applique a TOUTES les cotisations : RC T1, RC T2, CEG, CET, prevoyance, etc.

### 10. Prime de 13eme mois et primes proratisees
- Si une prime de 13eme mois n'est pas egale a 1/12 du brut annuel, verifier si c'est
  un prorata (embauche en cours d'annee, temps partiel, etc.) avant de signaler

## PROCESSUS D'ANALYSE

Etape 1 : Extraire les chiffres cles du bulletin
- Salaire de base : heures x taux (ou forfait mensuel)
- HS : heures x taux x majoration
- Primes
- Brut total
- Chaque ligne de cotisation salariale : base x taux = montant
- Remboursements
- Net a payer

Etape 2 : Verifier chaque ligne avec un calcul
- Pour chaque ligne, fais le calcul et compare au bulletin
- Si ton calcul = bulletin (a 1.00 EUR pres) : CONFORME, passe a la suivante
- Si ecart > 1 EUR ET impacte le net du salarie : note l'anomalie

Etape 3 : Verifier les assiettes CSG/CRDS
- Additionne TOUTES les assiettes CSG du bulletin (toutes les lignes CSG/CRDS)
- Compare a 98.25% x (brut + cotis patronales prevoyance/mutuelle)
- Si ca correspond (a 2 EUR pres) : CONFORME

Etape 4 : Verifier conformite legale
- Salaire >= SMIC ? (utilise le SMIC correspondant a la date du bulletin)
- HS majorees >= 25% ?
- Transport >= 50% abonnement ?
- Salaire >= minimum CCN ?

Etape 5 : Synthese HONNETE
- Si toutes les verifications passent : bulletin_conforme = true, status = "conforme"
- Ne compte que les ecarts > 1 EUR/mois et classes C1/C2
- Si gain total < 20 EUR/mois : bulletin_conforme = true, status = "conforme"

## FORMAT DE REPONSE
Reponds UNIQUEMENT en JSON valide, sans texte avant ou apres :
{
  "status": "conforme | anomalies_detectees",
  "bulletin_conforme": true,
  "nb_anomalies": 0,
  "nombre_anomalies": 0,
  "gain_mensuel": 0.0,
  "gain_annuel": 0.0,
  "gain_total_potentiel": 0.0,
  "anciennete_mois": 0,
  "periode_reclamable_mois": 0,
  "salaire_net_mensuel": 0.0,
  "pourcentage_salaire_annuel": 0.0,
  "pourcentage_salaire_total": 0.0,
  "prix_rapport": 19,
  "periode_bulletin": "septembre 2025",
  "anomalies_resume": [
    {
      "categorie": "C1 ou C2",
      "description_vague": "description sans reveler le detail exact de l'erreur",
      "impact_mensuel": 0.0,
      "certitude": "certaine ou probable"
    }
  ],
  "message_teaser": "Description factuelle et rassurante, sans reveler le detail exact",
  "points_attention": [],
  "raisonnement": "OBLIGATOIRE: montre TOUS tes calculs de verification ligne par ligne"
}

## STYLE DE RAISONNEMENT
- Sois CONCIS dans le raisonnement. Pour chaque ligne : calcul attendu, valeur bulletin, verdict (CONFORME ou ANOMALIE).
- Ne te contredis JAMAIS. Si tu conclus qu'une ligne est conforme, ne reviens pas dessus.
- Si tu hesites entre "anomalie" et "conforme", choisis CONFORME. Pas de va-et-vient.
- Maximum 1500 mots pour le raisonnement.

## COHERENCE INTERNE OBLIGATOIRE
- Si ton raisonnement montre qu'un ecart est <= 1 EUR, ne le mets PAS dans anomalies_resume
- gain_mensuel DOIT etre la somme exacte des impact_mensuel des anomalies listees
- gain_annuel DOIT etre gain_mensuel x 12
- periode_reclamable_mois DOIT etre MIN(anciennete_mois, 36). JAMAIS plus de 36.
- gain_total_potentiel DOIT etre gain_mensuel x periode_reclamable_mois
- Si ton raisonnement conclut "conforme", alors nb_anomalies = 0 et bulletin_conforme = true et status = "conforme"
- Ne JAMAIS inventer un ecart qui ne correspond pas a tes calculs
- nb_anomalies et nombre_anomalies doivent avoir la meme valeur

## IMPORTANT
- NE PAS reveler quelle ligne est erronee ni comment corriger dans message_teaser et description_vague
- Rester factuel et rassurant dans le message_teaser
- Le prix est base sur gain_annuel, PAS sur gain_total_potentiel
- Calculer precisement tous les montants`;


// ──────────────────────────────────────────────────
// HANDLER
// ──────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Rate limiting - max 3 analyses par heure par IP
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const rateLimitResult = await checkRateLimit(`analyze:${ip}`, 3, 3600000);

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
    const fileArrayBuffer = await fileResponse.arrayBuffer();
    const fileBuffer = Buffer.from(fileArrayBuffer);
    const fileBase64 = fileBuffer.toString('base64');

    // Détecter le vrai type MIME depuis les magic bytes (le type déclaré peut être faux)
    const detectedType = await fileTypeFromBuffer(fileBuffer);
    let mediaType;

    if (detectedType) {
      mediaType = detectedType.mime;
    } else {
      // Fallback: vérifier si c'est un PDF via magic bytes
      const isPDF = fileBuffer.length > 4 &&
        fileBuffer[0] === 0x25 && fileBuffer[1] === 0x50 &&
        fileBuffer[2] === 0x44 && fileBuffer[3] === 0x46;
      mediaType = isPDF ? 'application/pdf' : file.file_type;
    }

    // Normaliser image/jpg → image/jpeg
    if (mediaType === 'image/jpg') mediaType = 'image/jpeg';

    // ──────────────────────────────────────────────────
    // Construction du contexte RAG dynamique
    // ──────────────────────────────────────────────────
    const ragContext = buildContext({ includeAll: true, region: 'idf' });

    const analysisInstructions = `## BULLETIN DE PAIE A ANALYSER

### Donnees de reference (CONTEXTE RAG)
${ragContext}

Analyse ce bulletin de paie francais en utilisant les donnees de reference ci-dessus.
Identifie la date du bulletin et utilise les taux/montants de la periode correspondante.
Applique la methodologie complete (extraction, verification ligne par ligne, synthese).

Reponds UNIQUEMENT avec un objet JSON valide selon le format specifie.
NE PAS reveler la nature exacte des erreurs dans le message_teaser.

RAPPELS CRITIQUES :
1. Maladie salarie 0% = NORMAL depuis 2018
2. CSG/CRDS non deductible a 2.90% = CSG 2.40% + CRDS 0.50% regroupees = CORRECT
3. Si le bulletin a des HS exonerees, l'assiette CSG est SEPAREE en deux lignes. Additionne toutes les bases CSG avant de comparer.
4. L'assiette CSG = 98.25% x (brut + cotisations patronales prevoyance/mutuelle/IID). Si l'assiette est SUPERIEURE a 98.25% x brut seul, c'est normal.
5. Sur la ligne Navigo, "base" peut etre le nb de jours OU le prix abonnement. Verifie le montant rembourse.
6. Ecarts <= 1 EUR = arrondis normaux, NE PAS signaler
7. periode_reclamable_mois = MIN(anciennete, 36). JAMAIS plus de 36 mois.
8. Un bulletin conforme est un resultat VALIDE. Ne force pas des anomalies.
9. Un taux de cotisation SUPERIEUR au minimum legal n'est JAMAIS une anomalie.`;

    // Construire le contenu pour Claude Vision API
    let userContent;

    if (mediaType === 'application/pdf') {
      userContent = [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: fileBase64
          }
        },
        {
          type: 'text',
          text: analysisInstructions
        }
      ];
    } else {
      userContent = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: fileBase64
          }
        },
        {
          type: 'text',
          text: analysisInstructions
        }
      ];
    }

    // Appel à Claude API avec Vision (lecture directe du document)
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: userContent
      }]
    });

    // Parsing de la réponse Claude
    const responseText = message.content[0].text;
    let analysisResult;

    try {
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

    // ──────────────────────────────────────────────────
    // VERIFICATION DE COHERENCE COTE SERVEUR
    // (port de PAIE-DETECT v6 main.py lignes 463-469)
    // ──────────────────────────────────────────────────

    // Synchroniser nb_anomalies et nombre_anomalies
    const nbAnomalies = analysisResult.nb_anomalies || analysisResult.nombre_anomalies || 0;
    analysisResult.nb_anomalies = nbAnomalies;
    analysisResult.nombre_anomalies = nbAnomalies;

    // Capper periode_reclamable à 36 mois
    if ((analysisResult.periode_reclamable_mois || 0) > 36) {
      analysisResult.periode_reclamable_mois = Math.min(
        analysisResult.anciennete_mois || 36,
        36
      );
    }

    // Recalculer les gains pour cohérence
    const gainMensuel = analysisResult.gain_mensuel || 0;
    const periodeReclamable = analysisResult.periode_reclamable_mois || 0;
    analysisResult.gain_annuel = Math.round(gainMensuel * 12 * 100) / 100;
    analysisResult.gain_total_potentiel = Math.round(gainMensuel * periodeReclamable * 100) / 100;

    // Forcer la cohérence status/bulletin_conforme
    if (analysisResult.bulletin_conforme === true || nbAnomalies === 0) {
      analysisResult.status = 'conforme';
      analysisResult.bulletin_conforme = true;
      analysisResult.gain_mensuel = 0;
      analysisResult.gain_annuel = 0;
      analysisResult.gain_total_potentiel = 0;
      analysisResult.nombre_anomalies = 0;
      analysisResult.nb_anomalies = 0;
      analysisResult.anomalies_resume = [];
    } else {
      analysisResult.status = 'anomalies_detectees';
      analysisResult.bulletin_conforme = false;
    }

    // Pricing serveur (override Claude)
    const gainAnnuel = analysisResult.gain_annuel || 0;
    if (gainAnnuel <= 250) analysisResult.prix_rapport = 19;
    else if (gainAnnuel <= 500) analysisResult.prix_rapport = 39;
    else if (gainAnnuel <= 1000) analysisResult.prix_rapport = 89;
    else analysisResult.prix_rapport = 149;

    // Pourcentages du salaire
    const salaireNet = analysisResult.salaire_net_mensuel || 0;
    const netAnnuel = salaireNet * 12;
    if (netAnnuel > 0) {
      analysisResult.pourcentage_salaire_annuel = Math.round((gainAnnuel / netAnnuel) * 10000) / 100;
      analysisResult.pourcentage_salaire_total = Math.round(
        ((analysisResult.gain_total_potentiel || 0) / netAnnuel) * 10000
      ) / 100;
    }

    // Sauvegarde des résultats en DB
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
        ${analysisResult.raisonnement || '[Vision API - lecture directe du document]'},
        NOW(),
        false
      )
      RETURNING id
    `;

    const analysisId = analysisRecord.rows[0].id;

    // Réponse TEASER (compatible avec le frontend existant)
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
      error: "Erreur serveur lors de l'analyse"
    });
  }
}
