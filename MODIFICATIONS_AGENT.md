# Modifications pour intégration avec l'agent SOS-fiche-de-paie

## 🎯 Objectif

Adapter les APIs créées en Phase 3 pour correspondre au **flow conversationnel de l'agent** :

1. **Analyse TEASER** : Détection d'anomalies + calcul du gain → affichage prix barré → incitation à donner email
2. **Collecte email** : Prénom + email collectés en échange du rapport gratuit (offre de lancement)
3. **Rapport COMPLET** : Génération et envoi par email avec tous les détails

---

## ✅ Modifications effectuées

### 1. `/api/analyze.js` - Format TEASER

**Avant :**
- Retournait immédiatement tous les détails des anomalies
- Prompt générique d'analyse complète
- Structure de réponse : anomalies détaillées + références légales + recommandations

**Après :**
- Retourne uniquement un **TEASER** avec gain estimé
- Prompt spécialisé avec données de référence 2025 (SMIC, Pass Navigo, CSG/CRDS, etc.)
- Calcul automatique du **prix barré** selon la grille tarifaire
- Calcul du **% du salaire net annuel**
- Structure de réponse TEASER :

```javascript
{
  "status": "conforme" | "anomalies_detectees" | "probable",
  "nombre_anomalies": 2,
  "gain_mensuel": 24.27,
  "gain_annuel": 291.24,
  "gain_total_potentiel": 873.72,
  "anciennete_mois": 42,
  "periode_reclamable_mois": 36,
  "salaire_net_mensuel": 4292.00,
  "pourcentage_salaire_annuel": 0.6,
  "pourcentage_salaire_total": 1.7,
  "prix_rapport": 39,
  "periode_bulletin": "septembre 2025",
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
  ],
  "message_teaser": "Une anomalie a été détectée sur votre bulletin..."
}
```

**Fonctionnalités ajoutées :**
- Données de référence 2025 intégrées dans le prompt
- Calcul automatique du pricing selon gain ANNUEL
- Classification des anomalies (C1/C2/C3)
- Calcul de l'ancienneté et période réclamable (max 36 mois)
- Projection du gain sur la période réclamable

---

### 2. `/api/send-report.js` - Nouvelle API

**Création d'une API dédiée** pour l'envoi du rapport après collecte email.

**Endpoint :** `POST /api/send-report`

**Paramètres :**
```javascript
{
  "analysisId": "uuid-xxx",
  "prenom": "Jean",
  "email": "jean.dupont@example.com"
}
```

**Processus :**
1. Validation prénom + email
2. Vérification que l'analyse existe et n'a pas déjà été envoyée
3. Génération du **rapport COMPLET** via Claude API avec prompt détaillé
4. Sauvegarde du rapport + infos utilisateur en DB
5. Enregistrement du lead dans la table `leads`
6. Envoi de l'email HTML avec tous les détails

**Contenu du rapport COMPLET :**
- Résumé exécutif (nombre d'anomalies, gains)
- Détail de chaque anomalie avec :
  - Ligne concernée
  - Valeurs constatée vs attendue
  - Calcul de l'écart détaillé
  - Impact mensuel, annuel, total
  - Référence légale
  - Explication claire
- Procédure de réclamation
- Lettre de réclamation personnalisée prête à envoyer
- Références légales complètes

**Email envoyé :**
- Template HTML professionnel
- Design responsive avec gradient violet
- Montants mis en valeur
- Toutes les anomalies détaillées
- Lettre de réclamation dans un encadré
- Footer avec disclaimer juridique

---

### 3. `schema.sql` - Base de données

**Modifications de la table `analyses` :**

```sql
CREATE TABLE IF NOT EXISTS analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id UUID REFERENCES files(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Données TEASER (affichées avant collecte email)
  status VARCHAR(50) NOT NULL,
  nombre_anomalies INTEGER DEFAULT 0,
  gain_mensuel DECIMAL(10,2) DEFAULT 0,
  gain_annuel DECIMAL(10,2) DEFAULT 0,
  gain_total_potentiel DECIMAL(10,2) DEFAULT 0,
  anciennete_mois INTEGER DEFAULT 0,
  periode_reclamable_mois INTEGER DEFAULT 0,
  salaire_net_mensuel DECIMAL(10,2) DEFAULT 0,
  pourcentage_salaire_annuel DECIMAL(5,2) DEFAULT 0,
  pourcentage_salaire_total DECIMAL(5,2) DEFAULT 0,
  prix_rapport INTEGER DEFAULT 19,
  periode_bulletin VARCHAR(100),
  anomalies_resume JSONB DEFAULT '[]',
  message_teaser TEXT,

  -- Données COMPLÈTES (générées après collecte email)
  rapport_complet JSONB,
  user_prenom VARCHAR(100),
  user_email VARCHAR(255),
  report_sent BOOLEAN DEFAULT FALSE,
  report_sent_at TIMESTAMP,

  -- Données brutes
  raw_ocr_text TEXT,
  analyzed_at TIMESTAMP DEFAULT NOW()
);
```

**Nouvelle table `leads` :**

```sql
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prenom VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  analysis_id UUID REFERENCES analyses(id) ON DELETE SET NULL,
  gain_total_potentiel DECIMAL(10,2),
  prix_rapport INTEGER,
  source VARCHAR(50) DEFAULT 'offre_lancement',
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Objectif :** Tracker tous les emails collectés pendant l'offre de lancement.

---

### 4. `/api/report/[id].js` - Inchangé

Cette API reste fonctionnelle pour générer des PDFs si besoin, mais **n'est plus utilisée** dans le flow principal de l'agent.

Le rapport est maintenant envoyé directement par **email** via `/api/send-report.js`.

---

## 🔄 Nouveau Flow Utilisateur

### Avant (Phase 3 initiale)
```
1. Upload fichier → /api/upload
2. Lancer analyse → /api/analyze
3. Recevoir TOUS les détails immédiatement
4. (Optionnel) Télécharger PDF → /api/report/[id]
```

### Après (Adapté à l'agent)
```
1. Upload fichier → /api/upload
   ↓ Retourne fileId

2. Lancer analyse → /api/analyze
   ↓ Retourne TEASER (gain + prix barré + message)

3. Affichage dans le chat :
   "💰 Montant récupérable : 291 €/an
    Gain potentiel max : 874 €

    🎁 Rapport complet offert (~~39 €~~ → GRATUIT)

    📧 Donnez votre prénom + email pour le recevoir"

4. Collecte prénom + email → /api/send-report
   ↓ Génère rapport complet + envoie email

5. Confirmation :
   "✅ Rapport envoyé à votre adresse email !"
```

---

## 📊 Grille tarifaire (prix barré)

Le pricing est calculé automatiquement selon le **gain ANNUEL** :

| Gain ANNUEL | Prix normal (barré) | Prix lancement |
|-------------|---------------------|----------------|
| 0 - 250 €/an | 19 € | ~~19 €~~ **GRATUIT** |
| 251 - 500 €/an | 39 € | ~~39 €~~ **GRATUIT** |
| 501 - 1 000 €/an | 89 € | ~~89 €~~ **GRATUIT** |
| > 1 000 €/an | 149 € | ~~149 €~~ **GRATUIT** |

**Important :** Avec un seul bulletin, le prix est basé sur le **gain ANNUEL estimé** (erreur mensuelle × 12).

Le gain total potentiel sur 3 ans est mentionné comme "potentiel" mais ne détermine pas le prix.

---

## 🎯 Règles de l'agent respectées

✅ **Ne JAMAIS révéler les détails avant collecte email**
- L'API `/api/analyze` retourne uniquement des chiffres globaux
- Le message_teaser est factuel sans révéler quelle ligne est erronée

✅ **Toujours afficher le prix barré**
- Le prompt calcule automatiquement le prix selon la grille
- Affiché comme : "valeur ~~39 €~~ → **GRATUIT**"

✅ **Calcul du % du salaire net**
- Formule : `(gain_annuel / salaire_net_annuel) × 100`
- Exemple : "Cela représente environ **0,6%** de votre salaire net annuel"

✅ **Projection sur 3 ans**
- Ancienneté calculée automatiquement
- Période réclamable = MIN(ancienneté, 36 mois)
- Gain total = erreur mensuelle × période réclamable

✅ **Offre de lancement gratuite**
- Tous les rapports sont gratuits pendant le lancement
- La "monnaie" est le prénom + email
- Enregistrement dans la table `leads` pour tracking

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

# Réponse: { gain_annuel: 291, prix_rapport: 39, ... }

# 3. Envoi rapport
curl -X POST http://localhost:3000/api/send-report \
  -H "Content-Type: application/json" \
  -d '{
    "analysisId":"uuid-yyy",
    "prenom":"Jean",
    "email":"jean@example.com"
  }'

# Réponse: { "success": true, "message": "Rapport envoyé" }
```

---

## 📦 Dépendances (package.json)

Aucune nouvelle dépendance nécessaire. Le `package.json` créé en Phase 3 contient déjà tout :

- `@anthropic-ai/sdk` : Pour Claude API
- `@vercel/postgres` : Pour la DB
- `resend` : Pour l'envoi d'emails
- `tesseract.js` : Pour l'OCR
- `pdf2pic` : Pour convertir PDF en images

---

## 🚀 Prochaines étapes

### Phase 7 - Frontend (à faire)

Modifier `main.js` pour :

1. **Après analyse**, afficher le TEASER :
   ```javascript
   fetch('/api/analyze', { ... })
     .then(res => res.json())
     .then(data => {
       // Afficher gain_annuel, prix_rapport, message_teaser
       // Bouton "RECEVOIR LE RAPPORT GRATUIT" (valeur ~~XX €~~ → GRATUIT)
       // Input prénom + email
     });
   ```

2. **Après soumission prénom + email**, appeler `/api/send-report` :
   ```javascript
   fetch('/api/send-report', {
     method: 'POST',
     body: JSON.stringify({
       analysisId: data.analysisId,
       prenom: prenomInput.value,
       email: emailInput.value
     })
   })
   .then(res => res.json())
   .then(result => {
     // Afficher "✅ Rapport envoyé à votre adresse email !"
   });
   ```

3. **Option d'ajout de bulletins supplémentaires**
   - Demander 2-3 bulletins espacés (pas 36)
   - Si erreur confirmée sur 3 bulletins → projection sur 36 mois
   - Recalcul du pricing basé sur le gain projeté

---

## 📝 Notes importantes

### ⚠️ Prompt système caché

Le processus de calcul interne (extraction données, contrôles, anomalies détaillées) est **strictement invisible** pour l'utilisateur.

Seul le résultat final formaté (gain + prix + message teaser) est affiché.

### 📧 Email = monnaie d'échange

Pendant l'offre de lancement :
- Le rapport est **100% gratuit**
- Pas de paiement Stripe
- La seule "monnaie" est le **prénom + email**
- Tous les emails collectés sont dans la table `leads` pour suivi marketing

### 🔒 Sécurité

- Validation stricte du prénom (pas d'email, pas de chiffres)
- Validation email avec regex
- Rapport envoyé une seule fois (flag `report_sent`)
- Données personnelles chiffrées recommandé (non implémenté)

### 💰 Pricing dynamique

Le prix barré change automatiquement selon le gain annuel détecté :
- Petit gain (< 250 €/an) → ~~19 €~~
- Moyen (251-500 €/an) → ~~39 €~~
- Important (501-1000 €/an) → ~~89 €~~
- Très important (> 1000 €/an) → ~~149 €~~

Cela ancre la **valeur perçue** du rapport gratuit.

---

## ✅ Résumé des fichiers modifiés

| Fichier | Statut | Description |
|---------|--------|-------------|
| `/api/analyze.js` | ✅ Modifié | Prompt TEASER + calcul pricing + retour simplifié |
| `/api/send-report.js` | ✅ Créé | Génération rapport complet + envoi email |
| `schema.sql` | ✅ Modifié | Table analyses étendue + table leads |
| `/api/upload.js` | ⚪ Inchangé | Fonctionne tel quel |
| `/api/contact.js` | ⚪ Inchangé | Fonctionne tel quel |
| `/api/report/[id].js` | ⚪ Inchangé | Non utilisé dans le flow principal |

---

**Phase 3 adaptée avec succès ! ✅**

Le backend est maintenant aligné avec le flow conversationnel de l'agent SOS-fiche-de-paie.
