/**
 * Script de nettoyage automatique des fichiers et analyses expirés
 * Conformité RGPD : suppression après 30 jours
 *
 * À exécuter via un CRON job Vercel ou manuellement
 * Commande : node scripts/cleanup-expired-files.js
 */

import { PrismaClient } from '@prisma/client';
import { del } from '@vercel/blob';

const prisma = new PrismaClient();

async function cleanupExpiredData() {
  console.log('🧹 Démarrage du nettoyage des données expirées...');

  const now = new Date();

  try {
    // 1. Récupérer tous les fichiers expirés
    const expiredFiles = await prisma.file.findMany({
      where: {
        expiresAt: {
          lte: now
        }
      },
      include: {
        analysis: true
      }
    });

    console.log(`📂 ${expiredFiles.length} fichier(s) expiré(s) trouvé(s)`);

    // 2. Supprimer les fichiers du Blob Storage
    for (const file of expiredFiles) {
      try {
        // Supprimer du Blob Storage Vercel
        await del(file.blobUrl);
        console.log(`✅ Fichier supprimé du Blob Storage: ${file.originalName}`);
      } catch (error) {
        console.error(`❌ Erreur suppression Blob ${file.id}:`, error.message);
      }
    }

    // 3. Supprimer les analyses expirées (cascade sur files)
    const deletedAnalyses = await prisma.analysis.deleteMany({
      where: {
        expiresAt: {
          lte: now
        }
      }
    });

    console.log(`🗑️  ${deletedAnalyses.count} analyse(s) supprimée(s)`);

    // 4. Supprimer les fichiers expirés
    const deletedFiles = await prisma.file.deleteMany({
      where: {
        expiresAt: {
          lte: now
        }
      }
    });

    console.log(`🗑️  ${deletedFiles.count} fichier(s) supprimé(s)`);

    // 5. Nettoyer les anciennes tentatives d'API (> 24h)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const deletedAttempts = await prisma.apiAttempt.deleteMany({
      where: {
        attemptAt: {
          lt: oneDayAgo
        }
      }
    });

    console.log(`🗑️  ${deletedAttempts.count} tentative(s) API supprimée(s)`);

    console.log('✨ Nettoyage terminé avec succès !');

    return {
      success: true,
      deletedFiles: deletedFiles.count,
      deletedAnalyses: deletedAnalyses.count,
      deletedAttempts: deletedAttempts.count
    };

  } catch (error) {
    console.error('❌ Erreur lors du nettoyage:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Exécution directe du script
if (import.meta.url === `file://${process.argv[1]}`) {
  cleanupExpiredData()
    .then((result) => {
      console.log('📊 Résumé:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Échec du nettoyage:', error);
      process.exit(1);
    });
}

export default cleanupExpiredData;
