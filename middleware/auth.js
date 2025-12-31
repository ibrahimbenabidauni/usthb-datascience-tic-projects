import jwt from 'jsonwebtoken';

// Safely export JWT_SECRET with a fallback to avoid crashing on Vercel if env var is missing
export const JWT_SECRET = process.env.JWT_SECRET || 'tic-projects-platform-secret-key-2025';
const OLD_SECRET = 'tic-projects-platform-secret-key-2025';

/**
 * Robust Token Generation
 */
export const generateToken = (payload, expiresIn = '7d') => {
  try {
    console.log(`[JWT] Generating token for user: ${payload.username || payload.id}`);
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
  } catch (error) {
    console.error(`[JWT] Error generating token:`, error);
    throw new Error("Token generation failed");
  }
};

/**
 * Robust Authentication Middleware
 * - Handles both new (env var) and old (fallback) secrets
 * - Explicitly handles expiration and invalid tokens
 * - Safe for Vercel serverless functions
 */
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log('--- AUTH VERIFICATION START ---');
  console.log('[FLOW] Auth Header:', authHeader ? 'Present' : 'Missing');

  if (!token) {
    console.error('[FLOW] Auth Failed: No token provided');
    return res.status(401).json({ error: 'No token provided', code: 'MISSING_TOKEN' });
  }

  let decoded = null;
  let lastError = null;

  // Try both new and old secrets
  const secrets = [JWT_SECRET, OLD_SECRET];
  for (let i = 0; i < secrets.length; i++) {
    const currentSecret = secrets[i];
    const secretType = i === 0 ? "NEW_ENV_SECRET" : "OLD_FALLBACK_SECRET";
    try {
      decoded = jwt.verify(token, currentSecret);
      console.log(`[AUTH] Token successfully verified using ${secretType}. User:`, decoded.username || decoded.id);
      break; 
    } catch (err) {
      lastError = err;
      console.log(`[AUTH] Verification attempt failed with ${secretType}: ${err.message}`);
    }
  }

  if (decoded) {
    req.user = decoded;
    console.log('--- AUTH VERIFICATION SUCCESS ---');
    return next();
  }

  if (lastError && lastError.name === 'TokenExpiredError') {
    console.warn('[AUTH] Token expired', { expiredAt: lastError.expiredAt });
    return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
  }

  console.error('[AUTH] Invalid token', { 
    message: lastError ? lastError.message : 'Unknown error',
    env_secret_present: !!process.env.JWT_SECRET
  });
  
  return res.status(403).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
};
