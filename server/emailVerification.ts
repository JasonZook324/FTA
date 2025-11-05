import crypto from 'crypto';
import { db } from './db';
import { emailVerifications, users } from '@shared/schema';
import { eq, and, gt, lt } from 'drizzle-orm';
import { sendVerificationEmail } from './emailService';

const TOKEN_EXPIRY_HOURS = 24;

/**
 * Generate a random verification token
 */
export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a token for secure storage
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Create a verification token and send email
 */
export async function createAndSendVerificationToken(
  userId: string,
  email: string,
  username: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Generate token
    const token = generateVerificationToken();
    const tokenHash = hashToken(token);
    
    // Calculate expiry (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);

    // Delete any existing verification tokens for this user
    await db.delete(emailVerifications)
      .where(eq(emailVerifications.userId, userId));

    // Store hashed token in database
    await db.insert(emailVerifications).values({
      userId,
      tokenHash,
      expiresAt,
      verified: false,
    });

    // Send verification email (token in plain text)
    const emailSent = await sendVerificationEmail(email, username, token);

    if (!emailSent) {
      return {
        success: false,
        error: 'Failed to send verification email. Please try again later.',
      };
    }

    console.log(`✅ Verification email sent to ${email}`);
    return { success: true };
  } catch (error) {
    console.error('Error creating verification token:', error);
    return {
      success: false,
      error: 'Failed to create verification token. Please try again later.',
    };
  }
}

/**
 * Verify an email token
 */
export async function verifyEmailToken(token: string): Promise<{
  success: boolean;
  userId?: string;
  error?: string;
}> {
  try {
    const tokenHash = hashToken(token);
    const now = new Date();

    // Find the verification record
    const [verification] = await db.select()
      .from(emailVerifications)
      .where(
        and(
          eq(emailVerifications.tokenHash, tokenHash),
          gt(emailVerifications.expiresAt, now),
          eq(emailVerifications.verified, false)
        )
      )
      .limit(1);

    if (!verification) {
      return {
        success: false,
        error: 'Invalid or expired verification token.',
      };
    }

    // Mark token as verified
    await db.update(emailVerifications)
      .set({ verified: true })
      .where(eq(emailVerifications.id, verification.id));

    console.log(`✅ Email verified for user ${verification.userId}`);
    
    return {
      success: true,
      userId: verification.userId,
    };
  } catch (error) {
    console.error('Error verifying email token:', error);
    return {
      success: false,
      error: 'Failed to verify email. Please try again later.',
    };
  }
}

/**
 * Check if a user's email is verified
 */
export async function isEmailVerified(userId: string): Promise<boolean> {
  try {
    const [verification] = await db.select()
      .from(emailVerifications)
      .where(
        and(
          eq(emailVerifications.userId, userId),
          eq(emailVerifications.verified, true)
        )
      )
      .limit(1);

    return !!verification;
  } catch (error) {
    console.error('Error checking email verification status:', error);
    return false;
  }
}

/**
 * Resend verification email
 */
export async function resendVerificationEmail(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get user details
    const [user] = await db.select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user || !user.email) {
      return {
        success: false,
        error: 'User not found or email not set.',
      };
    }

    // Check if already verified
    const verified = await isEmailVerified(userId);
    if (verified) {
      return {
        success: false,
        error: 'Email is already verified.',
      };
    }

    // Create and send new token
    return await createAndSendVerificationToken(userId, user.email, user.username);
  } catch (error) {
    console.error('Error resending verification email:', error);
    return {
      success: false,
      error: 'Failed to resend verification email. Please try again later.',
    };
  }
}

/**
 * Clean up expired verification tokens (can be run periodically)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  try {
    const now = new Date();
    const result = await db.delete(emailVerifications)
      .where(
        and(
          lt(emailVerifications.expiresAt, now),
          eq(emailVerifications.verified, false)
        )
      );

    console.log(`🧹 Cleaned up ${result.rowCount || 0} expired verification tokens`);
    return result.rowCount || 0;
  } catch (error) {
    console.error('Error cleaning up expired tokens:', error);
    return 0;
  }
}
