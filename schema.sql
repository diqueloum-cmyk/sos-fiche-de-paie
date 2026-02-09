-- Schéma de base de données PostgreSQL pour SOS Fiche de Paie
-- À exécuter dans Neon Database

-- Extension pour UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: Users (pour futur système d'authentification)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  password_hash VARCHAR(255),
  subscription_tier VARCHAR(50) DEFAULT 'free',
  trial_ends_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index sur email pour recherche rapide
CREATE INDEX idx_users_email ON users(email);

-- Table: Files (fichiers uploadés)
CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  blob_url TEXT NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '30 days',
  deleted_at TIMESTAMP
);

-- Index pour nettoyage automatique
CREATE INDEX idx_files_expires_at ON files(expires_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_files_user_id ON files(user_id);

-- Table: Analyses (résultats d'analyse - format TEASER + COMPLET)
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

-- Index pour recherches
CREATE INDEX idx_analyses_file_id ON analyses(file_id);
CREATE INDEX idx_analyses_user_id ON analyses(user_id);
CREATE INDEX idx_analyses_status ON analyses(status);
CREATE INDEX idx_analyses_email ON analyses(user_email);
CREATE INDEX idx_analyses_report_sent ON analyses(report_sent);

-- Table: Subscriptions (abonnements Stripe)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  stripe_customer_id VARCHAR(255),
  plan VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index pour Stripe webhooks
CREATE INDEX idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);

-- Table: Contact Messages (messages de contact)
CREATE TABLE IF NOT EXISTS contact_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  message TEXT NOT NULL,
  ip_address VARCHAR(45),
  status VARCHAR(50) DEFAULT 'new',
  replied_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index pour gestion des messages
CREATE INDEX idx_contact_status ON contact_messages(status);
CREATE INDEX idx_contact_created_at ON contact_messages(created_at DESC);

-- Table: Usage Stats (statistiques d'utilisation)
CREATE TABLE IF NOT EXISTS usage_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(100) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index pour analytics
CREATE INDEX idx_usage_user_id ON usage_stats(user_id);
CREATE INDEX idx_usage_action ON usage_stats(action);
CREATE INDEX idx_usage_created_at ON usage_stats(created_at DESC);

-- Fonction: Nettoyage automatique des fichiers expirés
CREATE OR REPLACE FUNCTION delete_expired_files()
RETURNS void AS $$
BEGIN
  UPDATE files
  SET deleted_at = NOW()
  WHERE expires_at < NOW()
    AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Mise à jour automatique de updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Vue: Statistiques globales
CREATE OR REPLACE VIEW stats_overview AS
SELECT
  (SELECT COUNT(*) FROM users) as total_users,
  (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days') as new_users_7d,
  (SELECT COUNT(*) FROM files WHERE deleted_at IS NULL) as total_files,
  (SELECT COUNT(*) FROM analyses) as total_analyses,
  (SELECT COUNT(*) FROM analyses WHERE analyzed_at > NOW() - INTERVAL '7 days') as analyses_7d,
  (SELECT COUNT(*) FROM subscriptions WHERE status = 'active') as active_subscriptions,
  (SELECT AVG(score_conformite)::INTEGER FROM analyses WHERE score_conformite IS NOT NULL) as avg_conformite_score;

-- Commentaires pour documentation
COMMENT ON TABLE users IS 'Table des utilisateurs avec gestion d''abonnement';
COMMENT ON TABLE files IS 'Fichiers uploadés (fiches de paie) avec TTL de 30 jours';
COMMENT ON TABLE analyses IS 'Résultats d''analyses - TEASER (avant email) + COMPLET (après email)';
COMMENT ON TABLE subscriptions IS 'Abonnements Stripe des utilisateurs';
COMMENT ON TABLE contact_messages IS 'Messages reçus via le formulaire de contact';
COMMENT ON TABLE usage_stats IS 'Statistiques d''utilisation pour analytics';

-- Table: Leads (emails collectés via offre gratuite)
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

-- Index pour leads
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);

COMMENT ON TABLE leads IS 'Emails collectés via l''offre de lancement gratuite';

-- Données de test (optionnel, à supprimer en production)
-- INSERT INTO users (email, name, subscription_tier) VALUES
--   ('test@example.com', 'Test User', 'free');

-- Afficher le résumé
SELECT 'Database schema created successfully!' AS status;
SELECT * FROM stats_overview;
