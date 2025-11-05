# Email Verification Setup Guide

This application now includes email verification functionality using SendGrid. New users will receive a verification email upon registration.

## Prerequisites

1. **SendGrid Account**: Sign up for a free account at [SendGrid](https://sendgrid.com/)
2. **SendGrid API Key**: Create an API key with "Mail Send" permissions
3. **Verified Sender**: Configure a verified sender email address in SendGrid

## Environment Configuration

Add the following environment variables to your `.env` file:

```env
# SendGrid Configuration (REQUIRED for email verification)
SENDGRID_API_KEY=your_sendgrid_api_key_here
SENDGRID_FROM_EMAIL=noreply@yourdomain.com

# Optional: Customize application settings
APP_NAME=Fantasy Tracker
APP_URL=http://localhost:5000
```

### Environment Variables Explained:

- **SENDGRID_API_KEY** (Required): Your SendGrid API key
- **SENDGRID_FROM_EMAIL** (Required): The "from" email address that appears in verification emails. This must be a verified sender in your SendGrid account.
- **APP_NAME** (Optional): The application name shown in emails. Default: "Fantasy Tracker"
- **APP_URL** (Optional): The base URL of your application. Default: "http://localhost:5000"

## Database Schema

The `EmailVerifications` table has been added to track verification tokens:

```sql
TABLE EmailVerifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

The Drizzle ORM schema has been updated in `shared/schema.ts` to include this table.

## How It Works

### 1. User Registration Flow

When a user registers:
1. Account is created with their email address
2. A verification token is generated and hashed
3. Token is stored in the database with a 24-hour expiration
4. Verification email is sent to the user's email address
5. User receives a response indicating if email was sent successfully

### 2. Login Restriction

**Important**: Users with unverified emails **cannot log in**. When attempting to log in:
- If email is not verified, login is blocked with message: "Please verify your email address before logging in"
- Users can request a new verification email via `/api/resend-verification-public`
- Once email is verified, user can log in normally

### 3. Email Verification

The verification email contains:
- A personalized greeting
- A verification link with the token
- 24-hour expiration notice
- Styled HTML template with your app branding

### 4. Token Verification

When user clicks the verification link:
1. Frontend calls `/api/verify-email?token=<token>`
2. Backend hashes the token and looks it up in the database
3. Checks if token is valid and not expired
4. Marks the token as verified
5. Returns success/failure response

## API Endpoints

### 1. Verify Email (GET)

**Endpoint**: `/api/verify-email?token=<token>`

**Description**: Verifies a user's email address using the token from the verification email.

**Query Parameters**:
- `token` (string, required): The verification token from the email

**Response** (Success - 200):
```json
{
  "success": true,
  "message": "Email verified successfully!",
  "userId": "user-uuid"
}
```

**Response** (Error - 400):
```json
{
  "success": false,
  "message": "Invalid or expired verification token."
}
```

### 2. Resend Verification Email (POST)

**Endpoint**: `/api/resend-verification`

**Description**: Resends the verification email to the authenticated user.

**Authentication**: Required (user must be logged in)

**Response** (Success - 200):
```json
{
  "success": true,
  "message": "Verification email sent successfully!"
}
```

**Response** (Error - 400):
```json
{
  "success": false,
  "message": "Email is already verified."
}
```

### 3. Check Verification Status (GET)

**Endpoint**: `/api/email-verification-status`

**Description**: Checks if the authenticated user's email is verified.

**Authentication**: Required (user must be logged in)

**Response** (200):
```json
{
  "verified": true,
  "email": "user@example.com"
}
```

### 4. Resend Verification (Public) (POST)

**Endpoint**: `/api/resend-verification-public`

**Description**: Allows users who can't log in (due to unverified email) to request a new verification email.

**Authentication**: Not required (public endpoint)

**Request Body**:
```json
{
  "emailOrUsername": "user@example.com"
}
```

**Response** (Success - 200):
```json
{
  "success": true,
  "message": "If an account exists with that email/username, a verification email has been sent."
}
```

**Note**: For security, this endpoint doesn't reveal whether the user exists or not.

## Frontend Integration

### 1. Registration Flow

After user registration, check the response:

```typescript
const response = await fetch('/api/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password, email })
});

const data = await response.json();

if (data.emailVerificationSent) {
  // Show message: "Please check your email to verify your account"
}
```

### 2. Email Verification Page

Create a verification page that handles the token:

```typescript
// In your verification page component
const params = new URLSearchParams(window.location.search);
const token = params.get('token');

if (token) {
  const response = await fetch(`/api/verify-email?token=${token}`);
  const data = await response.json();
  
  if (data.success) {
    // Show success message and redirect to login/dashboard
  } else {
    // Show error message
  }
}
```

### 3. Resend Verification Email

```typescript
const resendVerification = async () => {
  const response = await fetch('/api/resend-verification', {
    method: 'POST',
    credentials: 'include'
  });
  
  const data = await response.json();
  // Show success or error message
};
```

### 4. Check Verification Status

```typescript
const checkVerificationStatus = async () => {
  const response = await fetch('/api/email-verification-status', {
    credentials: 'include'
  });
  
  const data = await response.json();
  
  if (!data.verified) {
    // Show banner: "Please verify your email address"
    // Show button to resend verification email
  }
};
```

## Email Templates

The verification emails are styled with a modern design including:
- Gradient header with app name
- Clear call-to-action button
- Plain text link as fallback
- Expiration notice
- Professional footer

You can customize the templates in `server/emailService.ts`.

## Security Features

1. **Token Hashing**: Tokens are hashed using SHA-256 before storage
2. **Expiration**: Tokens expire after 24 hours
3. **One-Time Use**: Tokens are marked as verified after use
4. **Secure Generation**: Uses crypto.randomBytes for token generation
5. **User Isolation**: Each user can only have one active verification token

## Testing

### Local Development

1. Set up SendGrid API key in `.env`
2. Use SendGrid's sandbox mode or a test email address
3. Register a new user and check your email inbox
4. Click the verification link
5. Verify the token is marked as verified in the database

### Production

1. Use environment variables on your hosting platform
2. Ensure SENDGRID_FROM_EMAIL is verified in SendGrid
3. Monitor SendGrid dashboard for email delivery status
4. Set up proper error logging

## Troubleshooting

### Email Not Sending

1. **Check SendGrid API Key**: Verify it's correctly set in `.env`
2. **Verify Sender**: Make sure SENDGRID_FROM_EMAIL is verified in SendGrid
3. **Check Logs**: Look for SendGrid error messages in server logs
4. **API Quota**: Free tier has sending limits

### Token Invalid/Expired

1. **Check Expiration**: Tokens expire after 24 hours
2. **Database State**: Verify token exists in database
3. **Hashing Issue**: Ensure token is properly hashed on both ends

### Server Errors

1. Check that all imports are correct
2. Verify database connection is working
3. Ensure email_verifications table exists
4. Check server logs for detailed error messages

## Maintenance

### Cleanup Expired Tokens

You can periodically clean up expired verification tokens:

```typescript
import { cleanupExpiredTokens } from './server/emailVerification';

// Run this periodically (e.g., daily via cron job)
await cleanupExpiredTokens();
```

## Future Enhancements

Possible improvements to consider:
- Password reset functionality (already included in emailService.ts)
- Email change verification
- Two-factor authentication
- Email preferences/notifications
- Rate limiting for resend requests

## Support

For issues or questions:
1. Check the SendGrid dashboard for email delivery status
2. Review server logs for detailed error messages
3. Verify all environment variables are set correctly
4. Test with a different email address
