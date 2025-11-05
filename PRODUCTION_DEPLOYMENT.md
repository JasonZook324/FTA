# Production Deployment Checklist - Email Verification

## ⚠️ CRITICAL: Before Deploying to Production

### 1. Update Environment Variables

In your production environment (Render, Vercel, etc.), set these environment variables:

```bash
# Email Configuration
SENDGRID_API_KEY=your_production_sendgrid_api_key
SENDGRID_FROM_EMAIL=noreply@fantasytoolboxai.com
APP_NAME=Fantasy Toolbox AI

# ⚠️ MOST IMPORTANT: Update this to your production URL
APP_URL=https://fantasytoolboxai.com

# Other required variables
DATABASE_URL=your_production_database_url
SESSION_SECRET=your_production_session_secret
NODE_ENV=production
```

### 2. Verify SendGrid Configuration

- [ ] Sender email (`noreply@fantasytoolboxai.com`) is verified in SendGrid
- [ ] SendGrid API key has "Mail Send" permissions
- [ ] SendGrid account is active and not in sandbox mode (for production)

### 3. Test Email Links

After deployment:

1. Register a test user on production
2. Check that verification email arrives
3. **VERIFY** the link in the email points to:
   - ✅ `https://fantasytoolboxai.com/verify-email?token=...`
   - ❌ NOT `http://localhost:5000/verify-email?token=...`

### 4. Check Server Logs

On startup, you should see:

```
✅ SendGrid initialized successfully
📧 Email verification links will use: https://fantasytoolboxai.com
```

If you see a warning about localhost, your `APP_URL` is not set correctly!

### 5. Common Issues

#### Issue: Verification links still point to localhost

**Solution**: 
1. Make sure `APP_URL` is set in your production environment variables
2. Restart your production server/application
3. The environment variable must be set before the app starts

#### Issue: Emails not sending in production

**Solutions**:
- Verify SendGrid API key is correct
- Check SendGrid sender is verified
- Review SendGrid dashboard for delivery errors
- Check application logs for SendGrid errors

#### Issue: "Verification Failed" when clicking link

**Solutions**:
- Token may have expired (24 hours)
- Database connection issue
- Check server logs for detailed error

### 6. Environment-Specific Files

Do NOT commit these files to git:
- `.env` (local development)
- `.env.production` (if used)

Safe to commit:
- `.env.email.example` ✅
- `.env.production.example` ✅

### 7. Render.com Specific Instructions

If deploying to Render:

1. Go to your service dashboard
2. Navigate to "Environment" tab
3. Add environment variables:
   ```
   APP_URL = https://fantasytoolboxai.com
   SENDGRID_API_KEY = your_key
   SENDGRID_FROM_EMAIL = noreply@fantasytoolboxai.com
   APP_NAME = Fantasy Toolbox AI
   ```
4. Click "Save Changes"
5. Wait for automatic redeploy

### 8. Verification Checklist

Before going live:

- [ ] `APP_URL` set to production domain in environment variables
- [ ] SendGrid sender email verified
- [ ] Test registration completes successfully
- [ ] Verification email arrives
- [ ] Email link points to production domain
- [ ] Clicking link successfully verifies email
- [ ] Can log in after verification
- [ ] Cannot log in without verification

### 9. Monitoring

After deployment, monitor:

- SendGrid dashboard for email delivery stats
- Application logs for email sending errors
- User feedback about verification emails
- Check spam folder rates

### 10. Rollback Plan

If email verification causes issues:

1. Users can still register (graceful degradation)
2. Admins can manually verify users in database if needed
3. Can temporarily disable login restriction by commenting out verification check in `server/auth.ts`

---

## Quick Reference

**Local Development:**
```bash
APP_URL=http://localhost:5000
```

**Production:**
```bash
APP_URL=https://fantasytoolboxai.com
```

**No trailing slash!** ✅ `https://fantasytoolboxai.com` ❌ `https://fantasytoolboxai.com/`
