# 🚀 Quick Start: Email Verification

## Step 1: Get SendGrid API Key

1. Go to [SendGrid](https://sendgrid.com/) and create a free account
2. Navigate to Settings > API Keys
3. Create a new API key with "Mail Send" permissions
4. Copy the API key (you'll only see it once!)

## Step 2: Verify Sender Email

1. In SendGrid, go to Settings > Sender Authentication
2. Click "Verify a Single Sender"
3. Fill out the form with your email address (e.g., `noreply@yourdomain.com`)
4. Check your email and click the verification link
5. Wait for SendGrid to approve your sender

## Step 3: Configure Environment Variables

Add these to your `.env` file:

```env
SENDGRID_API_KEY=SG.your_actual_api_key_here
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
APP_NAME=Fantasy Tracker
APP_URL=http://localhost:5000
```

**Important**: Replace the placeholder values with your actual credentials!

## Step 4: Test the Implementation

1. **Start your server**:
   ```bash
   npm run dev
   ```

2. **Register a new user** (via your registration form or API):
   ```bash
   POST /api/register
   Content-Type: application/json
   
   {
     "username": "testuser",
     "email": "your-test-email@example.com",
     "password": "password123"
   }
   ```

3. **Check your email inbox** - You should receive a verification email

4. **Click the verification link** in the email

5. **Check verification status**:
   ```bash
   GET /api/email-verification-status
   ```

## Step 5: Integrate Frontend (Optional)

Use the example components in `client/src/VerifyEmailExample.tsx`:

1. **Create verification page**: Use `VerifyEmailPage` component
2. **Add verification banner**: Use `EmailVerificationBanner` component on dashboard

## Troubleshooting

### Email not sending?
- ✅ Check that SENDGRID_API_KEY is correctly set
- ✅ Verify sender email is approved in SendGrid
- ✅ Check server console for error messages
- ✅ Verify SendGrid dashboard for delivery status

### Token invalid/expired?
- ✅ Tokens expire after 24 hours
- ✅ Try resending the verification email
- ✅ Check database to see if token exists

### Server errors?
- ✅ Make sure all dependencies are installed: `npm install`
- ✅ Check that database table exists
- ✅ Verify imports are correct
- ✅ Check server logs for detailed errors

## What's Next?

Once email verification is working:

1. **Create a verification page** in your frontend
2. **Add verification banner** to dashboard for unverified users
3. **Optional**: Add middleware to require verification for certain features
4. **Optional**: Set up periodic cleanup of expired tokens

## Need Help?

- 📖 Read `EMAIL_VERIFICATION_SETUP.md` for detailed documentation
- 📖 Check `IMPLEMENTATION_SUMMARY.md` for implementation details
- 🔍 Review example components in `client/src/VerifyEmailExample.tsx`
- 📧 Check SendGrid dashboard for email delivery logs

---

**Time to complete**: ~10 minutes
**Difficulty**: Easy
**Prerequisites**: SendGrid account (free tier works!)
