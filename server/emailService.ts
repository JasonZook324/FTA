import sgMail from '@sendgrid/mail';

// Initialize SendGrid with API key from environment
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@yourdomain.com';
const APP_NAME = process.env.APP_NAME || 'Fantasy Tracker';
const APP_URL = process.env.APP_URL || 'http://localhost:5000';

if (!SENDGRID_API_KEY) {
  console.warn('⚠️  SENDGRID_API_KEY not found in environment variables. Email service will not work.');
} else {
  sgMail.setApiKey(SENDGRID_API_KEY);
  console.log('✅ SendGrid initialized successfully');
}

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Send an email using SendGrid
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  if (!SENDGRID_API_KEY) {
    console.error('Cannot send email: SENDGRID_API_KEY not configured');
    return false;
  }

  try {
    const msg = {
      to: options.to,
      from: FROM_EMAIL,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    await sgMail.send(msg);
    console.log(`✉️  Email sent to ${options.to}`);
    return true;
  } catch (error: any) {
    console.error('❌ Error sending email:', error.response?.body || error.message);
    return false;
  }
}

/**
 * Send email verification link to user
 */
export async function sendVerificationEmail(
  email: string,
  username: string,
  verificationToken: string
): Promise<boolean> {
  const verificationUrl = `${APP_URL}/verify-email?token=${verificationToken}`;

  const subject = `Verify your ${APP_NAME} account`;
  
  const text = `
Hello ${username},

Thank you for registering with ${APP_NAME}!

Please verify your email address by clicking the link below:
${verificationUrl}

This link will expire in 24 hours.

⚠️ Can't find this email? Check your spam or junk folder.

If you didn't create an account, you can safely ignore this email.

Best regards,
The ${APP_NAME} Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 8px 8px 0 0;
      text-align: center;
    }
    .content {
      background: #f8f9fa;
      padding: 30px;
      border-radius: 0 0 8px 8px;
    }
    .button {
      display: inline-block;
      padding: 14px 28px;
      background: #667eea;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin: 20px 0;
    }
    .button:hover {
      background: #5568d3;
    }
    .footer {
      text-align: center;
      margin-top: 20px;
      color: #666;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${APP_NAME}</h1>
  </div>
  <div class="content">
    <h2>Hello ${username}! 👋</h2>
    <p>Thank you for registering with ${APP_NAME}!</p>
    <p>Please verify your email address by clicking the button below:</p>
    <center>
      <a href="${verificationUrl}" class="button">Verify Email Address</a>
    </center>
    <p>Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: #667eea;">${verificationUrl}</p>
    <p><strong>This link will expire in 24 hours.</strong></p>
    <p style="margin-top: 20px; padding: 15px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
      ⚠️ <strong>Can't find this email?</strong> Check your spam or junk folder. To ensure delivery of future emails, please add our sender address to your contacts.
    </p>
    <p style="margin-top: 30px; color: #666; font-size: 14px;">
      If you didn't create an account, you can safely ignore this email.
    </p>
  </div>
  <div class="footer">
    <p>&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({
    to: email,
    subject,
    text,
    html,
  });
}

/**
 * Send password reset email (for future use)
 */
export async function sendPasswordResetEmail(
  email: string,
  username: string,
  resetToken: string
): Promise<boolean> {
  const resetUrl = `${APP_URL}/reset-password?token=${resetToken}`;

  const subject = `Reset your ${APP_NAME} password`;
  
  const text = `
Hello ${username},

We received a request to reset your password for your ${APP_NAME} account.

Click the link below to reset your password:
${resetUrl}

This link will expire in 1 hour.

If you didn't request a password reset, you can safely ignore this email.

Best regards,
The ${APP_NAME} Team
  `.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 8px 8px 0 0;
      text-align: center;
    }
    .content {
      background: #f8f9fa;
      padding: 30px;
      border-radius: 0 0 8px 8px;
    }
    .button {
      display: inline-block;
      padding: 14px 28px;
      background: #667eea;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin: 20px 0;
    }
    .footer {
      text-align: center;
      margin-top: 20px;
      color: #666;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${APP_NAME}</h1>
  </div>
  <div class="content">
    <h2>Password Reset Request</h2>
    <p>Hello ${username},</p>
    <p>We received a request to reset your password for your ${APP_NAME} account.</p>
    <center>
      <a href="${resetUrl}" class="button">Reset Password</a>
    </center>
    <p>Or copy and paste this link into your browser:</p>
    <p style="word-break: break-all; color: #667eea;">${resetUrl}</p>
    <p><strong>This link will expire in 1 hour.</strong></p>
    <p style="margin-top: 30px; color: #666; font-size: 14px;">
      If you didn't request a password reset, you can safely ignore this email.
    </p>
  </div>
  <div class="footer">
    <p>&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
  </div>
</body>
</html>
  `.trim();

  return sendEmail({
    to: email,
    subject,
    text,
    html,
  });
}
