/**
 * API Test - Simple endpoint pour tester le déploiement
 */

export default async function handler(req, res) {
  try {
    // Test des variables d'environnement
    const envStatus = {
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      DATABASE_URL: !!process.env.DATABASE_URL,
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
      BLOB_READ_WRITE_TOKEN: !!process.env.BLOB_READ_WRITE_TOKEN,
      NODE_ENV: process.env.NODE_ENV
    };

    return res.status(200).json({
      status: "OK",
      message: "API Test endpoint is working",
      timestamp: new Date().toISOString(),
      environment: envStatus
    });
  } catch (error) {
    return res.status(500).json({
      status: "ERROR",
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
