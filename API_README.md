# Documentation API - SOS Fiche de Paie

## Phase 3 ✅ Complétée et Adaptée : Backend API (Serverless Functions)

Cette documentation couvre les APIs créées pour la Phase 3 de la roadmap, **adaptées au flow conversationnel de l'agent SOS-fiche-de-paie**.

> **📄 Pour comprendre les modifications :** Voir [MODIFICATIONS_AGENT.md](./MODIFICATIONS_AGENT.md)

---

## 📁 Structure des fichiers

```
/api
├── upload.js          # Upload de fichiers
├── analyze.js         # Analyse TEASER (gain + prix barré, SANS détails)
├── send-report.js     # Génération + envoi rapport complet par email
├── contact.js         # Formulaire de contact
└── /report
    └── [id].js        # Génération PDF (legacy, non utilisé dans le flow principal)
```

## 🔄 Flow Utilisateur

```
1. Upload fichier → /api/upload (retourne fileId)
2. Analyse TEASER → /api/analyze (retourne gain + prix barré)
3. Affichage dans le chat : "💰 Récupérable : X €/an. Rapport ~~39€~~ → GRATUIT"
4. Collecte email → /api/send-report (génère + envoie rapport complet)
5. Confirmation : "✅ Rapport envoyé à votre email !"
```

---

## 🚀 Installation et Configuration

### 1. Installer les dépendances

```bash
npm install
```

### 2. Configurer les variables d'environnement

Copier `.env.example` vers `.env.local` et renseigner:

```bash
# Base de données Neon
DATABASE_URL=postgresql://...

# API Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Service email Resend
RESEND_API_KEY=re_...

# Stripe
STRIPE_SECRET_KEY=sk_...
```

### 3. Initialiser la base de données

Exécuter le schéma SQL dans Neon Database:

```bash
psql $DATABASE_URL -f schema.sql
```

### 4. Lancer en local

```bash
vercel dev
```

---

## 📡 API Endpoints

### 1. **POST /api/upload**

Upload d'une fiche de paie (PDF ou image).

**Request:**
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch('/api/upload', {
  method: 'POST',
  body: formData
});
```

**Response (200):**
```json
{
  "success": true,
  "fileId": "uuid-xxx",
  "fileName": "fiche_paie.pdf",
  "fileUrl": "https://blob.vercel-storage.com/...",
  "uploadedAt": "2025-01-15T10:30:00Z"
}
```

**Erreurs:**
- `400` - Fichier invalide ou trop volumineux
- `500` - Erreur serveur

**Validations:**
- Types autorisés: PDF, JPG, PNG, WebP
- Taille max: 10 MB
- Validation MIME type réelle (pas seulement l'extension)

---

### 2. **POST /api/analyze** ⚠️ FORMAT TEASER

Analyse d'une fiche de paie via OCR et Claude API. Retourne uniquement un **TEASER** avec le gain estimé et le prix barré. Les détails complets sont envoyés par email après collecte du prénom + email.

**Request:**
```javascript
const response = await fetch('/api/analyze', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    fileId: 'uuid-xxx'
  })
});
```

**Response (200) - TEASER uniquement :**
```json
{
  "success": true,
  "analysisId": "uuid-yyy",
  "status": "anomalies_detectees",
  "nombre_anomalies": 2,
  "gain_mensuel": 24.27,
  "gain_annuel": 291.24,
  "gain_total_potentiel": 873.72,
  "anciennete_mois": 42,
  "periode_reclamable_mois": 36,
  "pourcentage_salaire_annuel": 0.6,
  "pourcentage_salaire_total": 1.7,
  "prix_rapport": 39,
  "periode_bulletin": "septembre 2025",
  "message_teaser": "Une anomalie a été détectée sur votre bulletin...",
  "anomalies_resume": [
    {
      "categorie": "heures_sup",
      "impact_mensuel": 15.39,
      "certitude": "certaine"
    },
    {
      "categorie": "transport",
      "impact_mensuel": 8.88,
      "certitude": "certaine"
    }
  ]
}
```

**⚠️ IMPORTANT :** Cette réponse ne contient PAS :
- ❌ La nature exacte des erreurs (quelle ligne)
- ❌ Les calculs détaillés
- ❌ Les références légales
- ❌ La lettre de réclamation

Ces éléments sont dans le **rapport complet** envoyé par email via `/api/send-report`.

**Grille tarifaire (prix barré) :**

| Gain ANNUEL | Prix rapport |
|-------------|--------------|
| 0 - 250 €/an | 19 € |
| 251 - 500 €/an | 39 € |
| 501 - 1 000 €/an | 89 € |
| > 1 000 €/an | 149 € |

Le prix est basé sur le **gain ANNUEL** (erreur mensuelle × 12), pas sur le gain total.

**Erreurs:**
- `400` - fileId manquant
- `404` - Fichier non trouvé
- `429` - Rate limit dépassé (Claude API)
- `500` - Erreur OCR ou API

**Durée:**
- Temps d'exécution: 10-60 secondes
- Timeout: 60 secondes max

---

### 2bis. **POST /api/send-report** ⭐ NOUVEAU

Génération et envoi du rapport COMPLET par email après collecte du prénom + email.

**Request:**
```javascript
const response = await fetch('/api/send-report', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    analysisId: 'uuid-yyy',
    prenom: 'Jean',
    email: 'jean.dupont@example.com'
  })
});
```

**Response (200):**
```json
{
  "success": true,
  "message": "Rapport envoyé avec succès",
  "email_id": "resend-email-id"
}
```

**Erreurs:**
- `400` - Données manquantes ou invalides (prénom/email)
- `404` - Analyse non trouvée
- `429` - Rate limit (Claude API)
- `500` - Erreur génération ou envoi email

**Validations :**
- Prénom : 2-50 caractères, pas d'email ni chiffres
- Email : format valide avec @
- Rapport déjà envoyé : retourne success mais n'envoie pas deux fois

**Contenu de l'email :**
- Résumé exécutif (nombre anomalies, gains)
- Détail de CHAQUE anomalie :
  - Ligne concernée
  - Valeurs constatée vs attendue
  - Calcul de l'écart
  - Impact mensuel/annuel/total
  - Référence légale
  - Explication
- Procédure de réclamation
- Lettre de réclamation personnalisée prête à envoyer
- Références légales complètes

**Durée:**
- Temps d'exécution: 15-60 secondes (génération rapport via Claude)
- Timeout: 60 secondes max

---

### 3. **POST /api/contact**

Envoi d'un message de contact.

**Request:**
```javascript
const response = await fetch('/api/contact', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Jean Dupont',
    email: 'jean.dupont@example.com',
    subject: 'Question sur l\'analyse',
    message: 'Bonjour, j\'ai une question...',
    consent: true
  })
});
```

**Response (200):**
```json
{
  "success": true,
  "message": "Message envoyé avec succès"
}
```

**Erreurs:**
- `400` - Champs manquants ou email invalide
- `429` - Rate limit (3 messages/heure/IP)
- `500` - Erreur envoi email

**Validations:**
- Email valide (regex)
- Consentement RGPD obligatoire
- Sanitisation anti-XSS
- Rate limiting: 3 requêtes/heure/IP

**Emails envoyés:**
1. Email au support avec le message
2. Email de confirmation à l'utilisateur

---

### 4. **POST /api/contact**

**Request:**
```javascript
// Direct download via lien
window.open(`/api/report/${analysisId}`, '_blank');

// Ou via fetch
const response = await fetch(`/api/report/${analysisId}`);
const blob = await response.blob();
const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `rapport-${analysisId}.pdf`;
a.click();
```

**Response:**
- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename="rapport-analyse-{id}.pdf"`
- Binaire PDF

**Erreurs:**
- `400` - ID manquant
- `404` - Analyse non trouvée
- `500` - Erreur génération PDF

**Contenu du PDF:**
- En-tête avec logo et titre
- Informations générales (fichier, dates)
- Score de conformité avec couleur (vert/orange/rouge)
- Montants clés
- Liste des anomalies détectées
- Recommandations
- Références légales
- Pied de page avec disclaimer

---

### 5. **GET /api/report/[id]** (Legacy)

⚠️ **Non utilisé dans le flow principal.** Le rapport est maintenant envoyé par email via `/api/send-report`.

Cette API reste disponible pour générer un PDF téléchargeable si besoin.

**Request:**
```javascript
window.open(`/api/report/${analysisId}`, '_blank');
```

**Response:**
- Content-Type: `application/pdf`
- Téléchargement du PDF

---

## 🔐 Sécurité

### Rate Limiting

- **Contact:** 3 messages/heure/IP (en mémoire, migrer vers Upstash Redis en prod)
- **Upload:** À implémenter avec Vercel Edge Middleware
- **Analyze:** Limité par quotas Claude API

### Validation

- **Upload:** MIME type réel vérifié (libmagic via formidable)
- **Contact:** Sanitisation anti-XSS, validation email regex
- **Données sensibles:** Chiffrement recommandé en DB (non implémenté)

### Headers de sécurité

Configurés dans `vercel.json`:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-XSS-Protection: 1; mode=block`

---

## 💾 Base de données

### Tables créées (schema.sql)

1. **users** - Utilisateurs (futur auth)
2. **files** - Fichiers uploadés (TTL 30 jours)
3. **analyses** - Résultats d'analyses
4. **subscriptions** - Abonnements Stripe
5. **contact_messages** - Messages de contact
6. **usage_stats** - Statistiques d'utilisation

### Nettoyage automatique

Fonction SQL pour supprimer les fichiers expirés:
```sql
SELECT delete_expired_files();
```

À exécuter via CRON job serverless (Phase 5).

---

## 🧪 Tests

### Test du flow complet

```bash
# 1. Upload
curl -X POST http://localhost:3000/api/upload \
  -F "file=@bulletin_septembre_2025.pdf"
# Réponse: { "fileId": "uuid-xxx" }

# 2. Analyse TEASER
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"fileId":"uuid-xxx"}'
# Réponse: { "gain_annuel": 291, "prix_rapport": 39, ... }

# 3. Envoi rapport complet par email
curl -X POST http://localhost:3000/api/send-report \
  -H "Content-Type: application/json" \
  -d '{
    "analysisId":"uuid-yyy",
    "prenom":"Jean",
    "email":"jean@example.com"
  }'
# Réponse: { "success": true, "message": "Rapport envoyé" }

# 4. Contact (optionnel)
curl -X POST http://localhost:3000/api/contact \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test",
    "email": "test@example.com",
    "subject": "Test",
    "message": "Test message",
    "consent": true
  }'
```

---

## 📊 Coûts estimés

### Claude API (Opus 4.6)
- Input: $15/M tokens
- Output: $75/M tokens
- **Analyse TEASER** : ~2000 tokens → **~0.18€/analyse**
- **Rapport COMPLET** : ~4000 tokens → **~0.30€/rapport**
- **Total par utilisateur** : ~0.48€ (teaser + rapport complet)

### Vercel
- Hobby: Gratuit (100GB bandwidth)
- Pro: 20$/mois (1TB bandwidth)

### Neon Database
- Free: 3GB max
- Pro: 0.10$/GB/mois

### Resend (emails)
- Free: 3000 emails/mois
- Pro: 20$/mois (50k emails)

---

## 🚧 À faire ensuite (Phases suivantes)

### Phase 4 - Optimisations Claude
- [ ] Améliorer le prompt système
- [ ] Tester différents modèles (Haiku pour speed/cost)
- [ ] Caching du prompt système

### Phase 5 - Sécurité avancée
- [ ] Rate limiting avec Upstash Redis
- [ ] Scan antivirus des uploads (ClamAV)
- [ ] Chiffrement des données sensibles
- [ ] CRON job nettoyage fichiers

### Phase 6 - Paiements
- [ ] Intégration Stripe Checkout
- [ ] Webhooks Stripe
- [ ] Gestion des abonnements
- [ ] Trial 30 jours

### Phase 7 - Frontend
- [ ] Remplacer simulation par API réelle
- [ ] Gestion d'erreurs améliorée
- [ ] Loading states
- [ ] Dashboard utilisateur

---

## 📝 Notes importantes

### ⚠️ Format TEASER vs COMPLET

**TEASER** (`/api/analyze`) :
- Retourne uniquement : gain estimé + prix barré + message générique
- NE révèle PAS : nature des erreurs, lignes concernées, calculs détaillés
- Objectif : inciter à donner prénom + email

**COMPLET** (`/api/send-report`) :
- Génère via Claude API : tous les détails + calculs + lettre de réclamation
- Envoyé par email après collecte prénom + email
- Sauvegardé en DB dans `analyses.rapport_complet`

### 🎁 Offre de lancement

Pendant l'offre de lancement :
- Tous les rapports sont **100% gratuits**
- La "monnaie" est le **prénom + email**
- Enregistrement dans la table `leads` pour tracking
- Le prix barré (19/39/89/149 €) ancre la valeur perçue

### 📊 Pricing dynamique

Le `prix_rapport` est calculé automatiquement selon le **gain ANNUEL** :
- Petit gain (< 250 €/an) → 19 €
- Moyen (251-500 €/an) → 39 €
- Important (501-1000 €/an) → 89 €
- Très important (> 1000 €/an) → 149 €

**Important :** Avec un seul bulletin, le prix est basé sur le gain annuel estimé (erreur mensuelle × 12), pas sur le gain total potentiel sur 3 ans.

### 🔒 Données collectées

Table `leads` :
- Tous les emails collectés pendant l'offre
- Lien vers l'analyse (`analysis_id`)
- Gain potentiel et prix rapport (pour stats)
- Source (`offre_lancement`)

### 🚀 Optimisations possibles

- **OCR:** Tesseract.js (gratuit) ou Google Vision API (meilleur mais payant)
- **Cache:** Cacher le prompt système Claude pour économiser tokens
- **Rate limiting:** Upstash Redis pour rate limiting distribué
- **Email:** Template système plus avancé avec React Email

---

## 🆘 Support

Pour toute question sur l'implémentation des APIs:
- Consulter la [ROADMAP.md](./ROADMAP.md) pour la roadmap complète
- Consulter [MODIFICATIONS_AGENT.md](./MODIFICATIONS_AGENT.md) pour les détails des adaptations
- Vérifier les logs Vercel: `vercel logs`
- Tester en local: `vercel dev`

**Phase 3 adaptée avec succès ! ✅**

Le backend est maintenant aligné avec le flow conversationnel de l'agent SOS-fiche-de-paie.
