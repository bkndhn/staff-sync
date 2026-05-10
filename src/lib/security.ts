/**
 * Security Utilities for Staff Management System
 * Implements proper authentication and security measures
 */

// Rate limiting storage
const loginAttempts: Map<string, { count: number; lastAttempt: number; blockedUntil: number }> = new Map();

// Security configuration
const SECURITY_CONFIG = {
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
    ATTEMPT_WINDOW: 5 * 60 * 1000, // 5 minutes
    SESSION_DURATION: 30 * 24 * 60 * 60 * 1000, // 30 days (as requested by user)
    MIN_PASSWORD_LENGTH: 8
};

/**
 * @deprecated - simpleHash is only kept for reference. All password hashing
 * is now handled server-side via bcrypt in the auth-login Edge Function.
 * Do NOT use this for any password operations.
 */
export function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    const salt = str.length * 17 + 42;
    return Math.abs(hash + salt).toString(36);
}

/**
 * Check if an IP/user is rate limited
 */
export function isRateLimited(identifier: string): { limited: boolean; remainingTime: number } {
    const attempt = loginAttempts.get(identifier);

    if (!attempt) {
        return { limited: false, remainingTime: 0 };
    }

    const now = Date.now();

    // Check if blocked
    if (attempt.blockedUntil > now) {
        return {
            limited: true,
            remainingTime: Math.ceil((attempt.blockedUntil - now) / 1000 / 60)
        };
    }

    // Reset if window expired
    if (now - attempt.lastAttempt > SECURITY_CONFIG.ATTEMPT_WINDOW) {
        loginAttempts.delete(identifier);
        return { limited: false, remainingTime: 0 };
    }

    return { limited: false, remainingTime: 0 };
}

/**
 * Record a failed login attempt
 */
export function recordFailedAttempt(identifier: string): { blocked: boolean; message: string } {
    const now = Date.now();
    const attempt = loginAttempts.get(identifier) || { count: 0, lastAttempt: now, blockedUntil: 0 };

    attempt.count++;
    attempt.lastAttempt = now;

    if (attempt.count >= SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS) {
        attempt.blockedUntil = now + SECURITY_CONFIG.LOCKOUT_DURATION;
        loginAttempts.set(identifier, attempt);
        const minutes = Math.ceil(SECURITY_CONFIG.LOCKOUT_DURATION / 1000 / 60);
        return {
            blocked: true,
            message: `Too many failed attempts. Account locked for ${minutes} minutes.`
        };
    }

    loginAttempts.set(identifier, attempt);
    const remaining = SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS - attempt.count;
    return {
        blocked: false,
        message: `Invalid credentials. ${remaining} attempts remaining.`
    };
}

/**
 * Clear failed attempts on successful login
 */
export function clearFailedAttempts(identifier: string): void {
    loginAttempts.delete(identifier);
}

/**
 * Validate password strength
 */
export function validatePasswordStrength(password: string): { valid: boolean; message: string } {
    if (password.length < SECURITY_CONFIG.MIN_PASSWORD_LENGTH) {
        return { valid: false, message: `Password must be at least ${SECURITY_CONFIG.MIN_PASSWORD_LENGTH} characters` };
    }
    return { valid: true, message: '' };
}

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeInput(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .trim();
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Generate secure session token
 */
export function generateSessionToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Create secure session data
 */
export function createSecureSession(user: { email: string; role: string; location?: string | null }) {
    return {
        user: {
            email: user.email,
            role: user.role,
            location: user.location
        },
        token: generateSessionToken(),
        timestamp: Date.now(),
        expiresAt: Date.now() + SECURITY_CONFIG.SESSION_DURATION,
        fingerprint: generateBrowserFingerprint()
    };
}

/**
 * Generate browser fingerprint for session validation
 */
export function generateBrowserFingerprint(): string {
    const data = [
        navigator.userAgent,
        navigator.language,
        screen.width,
        screen.height,
        new Date().getTimezoneOffset()
    ].join('|');
    return simpleHash(data);
}

/**
 * Validate session - simplified to prevent unnecessary logouts
 */
export function validateSession(sessionData: any): boolean {
    // Basic check
    if (!sessionData) {
        return false;
    }

    // Ensure user data exists
    if (!sessionData.user || !sessionData.user.email || !sessionData.user.role) {
        return false;
    }

    // Check expiration only if expiresAt is present
    if (sessionData.expiresAt) {
        const now = Date.now();
        if (now > sessionData.expiresAt) {
            return false;
        }
    }

    // Session is valid
    return true;
}

/**
 * Security headers recommendations (for server-side implementation)
 */
export const RECOMMENDED_SECURITY_HEADERS = {
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
};

export { SECURITY_CONFIG };
