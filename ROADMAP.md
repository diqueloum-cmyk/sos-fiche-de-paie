# Roadmap de mise en production - SOS Fiche de Paie

## Stack technique

- **Frontend** : HTML/CSS/JS (actuel) → peut migrer vers Next.js ou rester statique
- **Hébergement** : Vercel (HTTPS automatique ✓)
- **Base de données** : Neon (PostgreSQL serverless)
- **IA** : Claude API (Anthropic) pour l'analyse
- **Backend** : API Routes Vercel (serverless functions)

---

## Phase 1 — Obligations légales (bloquant)

- [ ] 1. Créer `mentions-legales.html` — identité éditeur, hébergeur Vercel
- [ ] 2. Créer `confidentialite.html` — politique RGPD détaillée
- [ ] 3. Créer `cgu.html` — conditions générales d'utilisation
- [ ] 4. Intégrer un bandeau cookies — avec consentement (ex: Tarteaucitron.js)
- [ ] 5. Ajouter checkboxes consentement — formulaires upload/contact

---

## Phase 2 — Setup infrastructure

- [ ] 6. Créer compte Vercel et connecter le dépôt Git
- [ ] 7. Créer base de données Neon et récupérer la connection string
- [ ] 8. Configurer les variables d'environnement Vercel :
  - `DATABASE_URL=postgresql://...`
  - `ANTHROPIC_API_KEY=sk-ant-...`
  - `STRIPE_SECRET_KEY=sk_...`
  - `EMAIL_SERVICE_API_KEY=...`
- [ ] 9. Définir le schéma de base de données — tables : `users`, `analyses`, `files`, `subscriptions`
- [ ] 10. Choisir un ORM — Prisma (recommandé) ou Drizzle

---

## Phase 3 — Backend API (serverless functions)

### API Upload
- [ ] 11. Créer `/api/upload.js` :
  - Validation fichier (type MIME réel, taille)
  - Upload vers stockage (Vercel Blob ou S3)
  - Enregistrement en DB
  - Retour `fileId`

### API Analyze
- [ ] 12. Créer `/api/analyze.js` :
  - Récupération du fichier
  - OCR du PDF/image (Tesseract.js ou service externe)
  - Appel Claude API avec prompt spécialisé paie française
  - Parsing de la réponse (anomalies, montants)
  - Sauvegarde résultats en DB

### API Contact
- [ ] 13. Créer `/api/contact.js` :
  - Validation formulaire
  - Envoi email (Resend, SendGrid ou Mailgun)
  - Protection rate limiting

### API Report
- [ ] 14. Créer `/api/report/[id].js` :
  - Génération PDF du rapport (puppeteer ou PDFKit)
  - Téléchargement sécurisé

---

## Phase 4 — Agent Claude pour l'analyse

- [ ] 15. Créer le prompt système Claude — spécialisé en droit du travail français et analyse de bulletins de paie
- [ ] 16. Implémenter l'extraction OCR — Tesseract.js côté serveur ou API externe (Google Vision, AWS Textract)
- [ ] 17. Structurer l'appel Claude API :
  ```javascript
  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: `Analysez cette fiche de paie française et détectez les anomalies...

      ${extractedText}`
    }]
  });
  ```
- [ ] 18. Parser la réponse de Claude — extraire anomalies, montants, recommandations
- [ ] 19. Gérer les erreurs API — timeout, rate limit, réponse invalide

---

## Phase 5 — Sécurité

- [ ] 20. Ajouter validation serveur stricte — type MIME réel (libmagic), scan antivirus optionnel
- [ ] 21. Implémenter rate limiting — Vercel Edge Middleware ou Upstash Redis
- [ ] 22. Configurer les headers de sécurité dans `vercel.json` :
  ```json
  {
    "headers": [
      {
        "source": "/(.*)",
        "headers": [
          { "key": "X-Frame-Options", "value": "DENY" },
          { "key": "X-Content-Type-Options", "value": "nosniff" },
          { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
        ]
      }
    ]
  }
  ```
- [ ] 23. Chiffrer les données sensibles en DB — clés de chiffrement dans variables d'environnement
- [ ] 24. Définir la politique de suppression automatique — CRON job serverless pour nettoyer les fichiers après 30 jours

---

## Phase 6 — Paiement & comptes utilisateurs

- [ ] 25. Intégrer Stripe — Checkout Session pour abonnements
- [ ] 26. Créer système d'authentification — NextAuth.js ou Clerk
- [ ] 27. Créer `/api/webhooks/stripe.js` — gestion des événements d'abonnement
- [ ] 28. Implémenter la logique des paliers — limitation analyses selon abonnement
- [ ] 29. Gérer l'offre gratuite 30 jours — trial period Stripe ou logique custom

---

## Phase 7 — Frontend modifications

- [ ] 30. Remplacer la simulation par appels API réels dans `main.js`
- [ ] 31. Ajouter gestion d'erreurs — messages utilisateur clairs
- [ ] 32. Ajouter loader réel pendant l'analyse (peut prendre 10-30s avec Claude)
- [ ] 33. Créer page dashboard — `dashboard.html` avec historique analyses
- [ ] 34. Ajouter confirmation email — via Resend après inscription

---

## Phase 8 — Configuration Vercel

- [ ] 35. Créer `vercel.json` :
  ```json
  {
    "buildCommand": null,
    "framework": null,
    "rewrites": [
      { "source": "/api/(.*)", "destination": "/api/$1" }
    ]
  }
  ```
- [ ] 36. Configurer le domaine `sos-fiche-de-paie.fr` dans Vercel
- [ ] 37. Configurer l'email professionnel — via Resend (contact@sos-fiche-de-paie.fr)

---

## Phase 9 — SEO & finitions

- [ ] 38. Ajouter balises meta — title, description, OG tags
- [ ] 39. Créer `sitemap.xml` et `robots.txt`
- [ ] 40. Ajouter favicon et icônes PWA
- [ ] 41. Tester performance — Lighthouse, optimisations nécessaires

---

## Phase 10 — Tests & déploiement

- [ ] 42. Tester tous les parcours — upload → analyse → rapport
- [ ] 43. Tester paiement Stripe en mode test
- [ ] 44. Vérifier RGPD — consentement, suppression données
- [ ] 45. Déployer en production — `git push` vers Vercel

---

## Ordre recommandé d'exécution

1. **Setup infra** (Phase 2) — 1-2h
2. **Pages légales** (Phase 1) — 2-3h
3. **Backend API de base** (Phase 3) — 4-6h
4. **Agent Claude** (Phase 4) — 3-4h
5. **Connexion frontend** (Phase 7) — 2-3h
6. **Sécurité** (Phase 5) — 2-3h
7. **Paiement** (Phase 6) — 4-5h
8. **Tests & déploiement** (Phase 10) — 2-3h

**Temps total estimé : 20-30h de développement**

---

## Notes importantes

- **HTTPS** : Automatique avec Vercel ✓
- **Variables d'environnement** : À configurer dans Vercel Dashboard
- **Rate limiting** : Critique pour éviter les abus (coûts API Claude)
- **RGPD** : Consentement obligatoire + suppression automatique des fichiers
- **Coûts estimés** :
  - Vercel : Gratuit (Hobby) ou ~20$/mois (Pro)
  - Neon : Gratuit jusqu'à 3GB
  - Claude API : ~0.015$/1K tokens (coût variable selon usage)
  - Stripe : 1.4% + 0.25€ par transaction
