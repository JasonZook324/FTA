import crypto from 'crypto';
import { db } from './db';
import { passwordResetTokens, users } from '@shared/schema';
import { eq, and, gt } from 'drizzle-orm';
import { sendPasswordResetEmail } from './emailService';

const TOKEN_EXPIRY_HOURS = 1; // Password reset tokens expire in 1 hour for security

/**
 * Generate a random password reset token
 */
export function generateResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a token for secure storage
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Create a password reset token and send email
 */
export async function createAndSendPasswordResetToken(
  email: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Find user by email (case-insensitive)
    const [user] = await db.select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    // Don't reveal whether the email exists or not (security best practice)
    if (!user) {
      console.log(`Password reset requested for non-existent email: ${email}`);
      return { 
        success: true 
        // We return success even if the email doesn't exist to prevent email enumeration
      };
    }

    // Check if user's email is verified
    // Import this from emailVerification to avoid circular dependency
    const { isEmailVerified } = await import('./emailVerification');
    const verified = await isEmailVerified(user.id);
    
    if (!verified) {
      return {
        success: false,
        error: 'Email address has not been verified. Please verify your email first.',
      };
    }

    // Generate token
    const token = generateResetToken();
    const tokenHash = hashToken(token);
    
    // Calculate expiry (1 hour from now for security)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);

    // Delete any existing unused password reset tokens for this user
    await db.delete(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          eq(passwordResetTokens.used, false)
        )
      );

    // Store hashed token in database
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
      used: false,
    });

    // Send password reset email (token in plain text)
    const emailSent = await sendPasswordResetEmail(email, user.username, token);

    if (!emailSent) {
      return {
        success: false,
        error: 'Failed to send password reset email. Please try again later.',
      };
    }

    console.log(`✅ Password reset email sent to ${email}`);
    return { success: true };
  } catch (error) {
    console.error('Error creating password reset token:', error);
    return {
      success: false,
      error: 'Failed to create password reset token. Please try again later.',
    };
  }
}

/**
 * Verify a password reset token
 */
export async function verifyPasswordResetToken(token: string): Promise<{
  success: boolean;
  userId?: string;
  error?: string;
}> {
  try {
    const tokenHash = hashToken(token);
    const now = new Date();

    // Find the reset token record
    const [resetToken] = await db.select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          gt(passwordResetTokens.expiresAt, now),
          eq(passwordResetTokens.used, false)
        )
      )
      .limit(1);

    if (!resetToken) {
      return {
        success: false,
        error: 'Invalid or expired password reset token.',
      };
    }

    console.log(`✅ Password reset token verified for user ${resetToken.userId}`);
    
    return {
      success: true,
      userId: resetToken.userId,
    };
  } catch (error) {
    console.error('Error verifying password reset token:', error);
    return {
      success: false,
      error: 'Failed to verify password reset token. Please try again later.',
    };
  }
}

/**
 * Mark a password reset token as used
 */
export async function markTokenAsUsed(token: string): Promise<void> {
  try {
    const tokenHash = hashToken(token);
    
    await db.update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.tokenHash, tokenHash));
      
    console.log(`✅ Password reset token marked as used`);
  } catch (error) {
    console.error('Error marking token as used:', error);
  }
}
