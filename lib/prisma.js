/**
 * Singleton Prisma Client pour éviter les connexions multiples
 * Optimisé pour les environnements serverless (Vercel)
 */

import { PrismaClient } from '@prisma/client';

/**
 * PrismaClient est attaché à l'objet `global` en développement
 * pour éviter d'épuiser la limite de connexions lors du hot-reload
 */
const globalForPrisma = global;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
