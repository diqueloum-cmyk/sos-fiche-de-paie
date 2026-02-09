# Guide de déploiement - Phase 2 - SOS Fiche de Paie

Ce guide vous accompagne dans la configuration complète de l'infrastructure (Phase 2 du ROADMAP).

## Table des matières

1. [Prérequis](#prérequis)
2. [Étape 1 : Configuration du dépôt GitHub](#étape-1--configuration-du-dépôt-github)
3. [Étape 2 : Création de la base de données Neon](#étape-2--création-de-la-base-de-données-neon)
4. [Étape 3 : Configuration de Vercel](#étape-3--configuration-de-vercel)
5. [Étape 4 : Configuration des services externes](#étape-4--configuration-des-services-externes)
6. [Étape 5 : Configuration des variables d'environnement](#étape-5--configuration-des-variables-denvironnement)
7. [Étape 6 : Initialisation de la base de données](#étape-6--initialisation-de-la-base-de-données)
8. [Vérification de l'installation](#vérification-de-linstallation)
9. [Dépannage](#dépannage)

---

## Prérequis

- Node.js 18+ installé
- Git installé
- Compte GitHub
- Éditeur de code (VS Code recommandé)

---

## Étape 1 : Configuration du dépôt GitHub

### 1.1 Le dépôt est déjà initialisé

Le dépôt Git a déjà été initialisé et connecté à :
```
git@github.com:diqueloum-cmyk/sos-fiche-de-paie.git
```

### 1.2 Premier commit et push

```bash
# Installer les dépendances
npm install

# Ajouter tous les fichiers
git add .

# Créer le premier commit
git commit -m "Initial commit - Phase 2 infrastructure setup"

# Pousser vers GitHub
git push -u origin main
```

Si vous n'avez pas encore de branche `main`, créez-la :
```bash
git branch -M main
git push -u origin main
```

---

## Étape 2 : Création de la base de données Neon

### 2.1 Créer un compte Neon

1. Allez sur [https://console.neon.tech/](https://console.neon.tech/)
2. Créez un compte (gratuit jusqu'à 3 GB)
3. Cliquez sur **"Create a project"**

### 2.2 Configurer le projet

- **Nom du projet** : `sos-fiche-de-paie`
- **Région** : Choisissez la plus proche (Europe : `eu-central-1` - Frankfurt)
- **PostgreSQL version** : 16 (dernière version)

### 2.3 Récupérer les connection strings

Dans votre projet Neon, allez dans **Connection Details** :

1. **Pooled connection** (pour l'application) :
   ```
   postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/dbname?sslmode=require
   ```
   → Copiez ceci pour `DATABASE_URL`

2. **Direct connection** (pour les migrations) :
   ```
   postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/dbname?sslmode=require
   ```
   → Copiez ceci pour `DIRECT_URL`

### 2.4 Sauvegarder les credentials

Copiez `.env.example` vers `.env` :
```bash
cp .env.example .env
```

Éditez `.env` et remplissez :
```env
DATABASE_URL="postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/dbname?sslmode=require"
DIRECT_URL="postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/dbname?sslmode=require"
```

---

## Étape 3 : Configuration de Vercel

### 3.1 Créer un compte Vercel

1. Allez sur [https://vercel.com/signup](https://vercel.com/signup)
2. Connectez-vous avec votre compte GitHub
3. Autorisez Vercel à accéder à vos dépôts

### 3.2 Importer le projet

1. Dans le dashboard Vercel, cliquez sur **"Add New Project"**
2. Sélectionnez le dépôt `sos-fiche-de-paie`
3. Configurez :
   - **Framework Preset** : Other
   - **Root Directory** : `./` (laisser par défaut)
   - **Build Command** : `npm run build`
   - **Output Directory** : Laisser vide

### 3.3 Configurer le Blob Storage

1. Dans votre projet Vercel, allez dans **Settings** > **Storage**
2. Cliquez sur **"Create Database"**
3. Sélectionnez **"Blob"**
4. Donnez un nom : `sos-fiche-paie-files`
5. Cliquez sur **"Create"**

Le token `BLOB_READ_WRITE_TOKEN` sera automatiquement ajouté aux variables d'environnement.

### 3.4 Configurer le domaine (optionnel)

1. Allez dans **Settings** > **Domains**
2. Ajoutez votre domaine : `sos-fiche-de-paie.fr`
3. Suivez les instructions pour configurer les DNS

---

## Étape 4 : Configuration des services externes

### 4.1 Anthropic (Claude AI)

1. Allez sur [https://console.anthropic.com/](https://console.anthropic.com/)
2. Créez un compte
3. Allez dans **Settings** > **API Keys**
4. Cliquez sur **"Create Key"**
5. Copiez la clé : `sk-ant-api03-xxxxx...`
6. Ajoutez-la dans `.env` :
   ```env
   ANTHROPIC_API_KEY="sk-ant-api03-xxxxx..."
   ```

### 4.2 Stripe (Paiements)

1. Allez sur [https://dashboard.stripe.com/register](https://dashboard.stripe.com/register)
2. Créez un compte
3. Récupérez vos clés API (mode test) :
   - **Developers** > **API keys**
   - Secret key : `sk_test_xxxxx...`
   - Publishable key : `pk_test_xxxxx...`

4. Créez vos produits et prix :
   - **Products** > **Add product**
   - Créez 3 produits :
     - Gratuit (30 jours d'essai)
     - Particulier (9.90€/mois)
     - Professionnel (29.90€/mois)
   - Copiez les Price IDs

5. Ajoutez dans `.env` :
   ```env
   STRIPE_SECRET_KEY="sk_test_xxxxx..."
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_xxxxx..."
   STRIPE_PRICE_ID_GRATUIT="price_xxxxx"
   STRIPE_PRICE_ID_PARTICULIER="price_xxxxx"
   STRIPE_PRICE_ID_PROFESSIONNEL="price_xxxxx"
   ```

### 4.3 Resend (Emails)

1. Allez sur [https://resend.com/signup](https://resend.com/signup)
2. Créez un compte
3. Allez dans **API Keys** > **Create API Key**
4. Copiez la clé : `re_xxxxx...`
5. Vérifiez votre domaine dans **Domains**
6. Ajoutez dans `.env` :
   ```env
   RESEND_API_KEY="re_xxxxx..."
   EMAIL_FROM="contact@sos-fiche-de-paie.fr"
   ```

### 4.4 Upstash Redis (Rate Limiting)

1. Allez sur [https://console.upstash.com/](https://console.upstash.com/)
2. Créez un compte (gratuit jusqu'à 10K requêtes/jour)
3. Cliquez sur **"Create Database"**
4. Configurez :
   - Type : **Redis**
   - Name : `sos-fiche-paie-ratelimit`
   - Region : Europe (Frankfurt)
5. Dans l'onglet **REST API**, copiez :
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
6. Ajoutez dans `.env` :
   ```env
   UPSTASH_REDIS_REST_URL="https://xxxxx.upstash.io"
   UPSTASH_REDIS_REST_TOKEN="AxxxXXXxxxxxxxxx"
   ```

### 4.5 Génération des secrets de sécurité

Générez des clés aléatoires sécurisées :

```bash
# Clé de chiffrement (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# JWT secret (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Ajoutez-les dans `.env` :
```env
ENCRYPTION_KEY="<clé générée 1>"
JWT_SECRET="<clé générée 2>"
```

---

## Étape 5 : Configuration des variables d'environnement

### 5.1 Variables d'environnement locales

Votre fichier `.env` doit maintenant contenir toutes les variables. Vérifiez avec :
```bash
cat .env
```

### 5.2 Variables d'environnement Vercel

1. Allez dans votre projet Vercel
2. **Settings** > **Environment Variables**
3. Ajoutez **toutes** les variables de votre `.env` :
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `ANTHROPIC_API_KEY`
   - `STRIPE_SECRET_KEY`
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - `STRIPE_WEBHOOK_SECRET` (à configurer plus tard)
   - `STRIPE_PRICE_ID_GRATUIT`
   - `STRIPE_PRICE_ID_PARTICULIER`
   - `STRIPE_PRICE_ID_PROFESSIONNEL`
   - `RESEND_API_KEY`
   - `EMAIL_FROM`
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `ENCRYPTION_KEY`
   - `JWT_SECRET`
   - `NEXT_PUBLIC_APP_URL` (votre domaine Vercel)
   - `FILE_RETENTION_DAYS` = `30`
   - `MAX_FILE_SIZE_MB` = `10`

4. Pour chaque variable, sélectionnez les environnements : **Production**, **Preview**, **Development**

---

## Étape 6 : Initialisation de la base de données

### 6.1 Générer le client Prisma

```bash
npx prisma generate
```

### 6.2 Créer la première migration

```bash
npx prisma migrate dev --name init
```

Cette commande va :
- Créer les tables dans votre base Neon
- Générer le client Prisma TypeScript

### 6.3 Vérifier la base de données

Ouvrez Prisma Studio pour visualiser vos tables :
```bash
npx prisma studio
```

Votre navigateur devrait s'ouvrir sur `http://localhost:5555` avec l'interface Prisma Studio.

### 6.4 Appliquer les migrations en production

Lors du premier déploiement Vercel, ajoutez une commande de build :

Dans `package.json`, la commande `build` devrait déjà inclure :
```json
"build": "prisma generate && echo 'Build complete'"
```

Vercel exécutera automatiquement `prisma migrate deploy` en production.

---

## Vérification de l'installation

### ✅ Checklist Phase 2

- [ ] Dépôt GitHub connecté et code poussé
- [ ] Base de données Neon créée et connection strings configurées
- [ ] Projet Vercel créé et lié au dépôt
- [ ] Vercel Blob Storage configuré
- [ ] API Anthropic (Claude) configurée
- [ ] Compte Stripe créé avec produits et prix
- [ ] Service email Resend configuré
- [ ] Upstash Redis configuré pour rate limiting
- [ ] Variables d'environnement configurées dans Vercel
- [ ] Prisma migrations exécutées avec succès
- [ ] Prisma Studio accessible localement

### Test local

Lancez le serveur de développement :
```bash
npm run dev
```

Visitez `http://localhost:3000` - votre site devrait s'afficher.

### Test des API (après Phase 3)

Une fois les routes API créées, testez-les avec :
```bash
curl http://localhost:3000/api/health
```

---

## Dépannage

### Problème : Prisma ne trouve pas DATABASE_URL

**Solution** : Vérifiez que `.env` est à la racine du projet et contient `DATABASE_URL`.

```bash
# Vérifier
echo $DATABASE_URL

# Si vide, rechargez
source .env
```

### Problème : Migration Prisma échoue

**Erreur** : `Error: P1001: Can't reach database server`

**Solution** :
1. Vérifiez la connexion réseau
2. Vérifiez que l'URL contient `?sslmode=require`
3. Testez la connexion :
   ```bash
   npx prisma db pull
   ```

### Problème : Vercel build échoue

**Solution** :
1. Vérifiez les logs de build dans Vercel Dashboard
2. Assurez-vous que toutes les variables d'environnement sont configurées
3. Vérifiez que `DATABASE_URL` et `DIRECT_URL` sont correctes

### Problème : Rate limiting ne fonctionne pas

**Solution** : Vérifiez que `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` sont correctement configurés dans Vercel.

---

## Prochaines étapes

Une fois la Phase 2 terminée, passez à la [Phase 3 : Backend API](./ROADMAP.md#phase-3--backend-api-serverless-functions).

Vous allez créer :
- `/api/upload.js` - Upload de fichiers
- `/api/analyze.js` - Analyse avec Claude
- `/api/contact.js` - Formulaire de contact
- `/api/report/[id].js` - Génération de rapports PDF

---

## Support

- Documentation Vercel : [https://vercel.com/docs](https://vercel.com/docs)
- Documentation Prisma : [https://www.prisma.io/docs](https://www.prisma.io/docs)
- Documentation Neon : [https://neon.tech/docs](https://neon.tech/docs)
- Documentation Claude API : [https://docs.anthropic.com/](https://docs.anthropic.com/)

---

**Félicitations ! Votre infrastructure est maintenant configurée. 🎉**
