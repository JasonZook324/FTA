// Reference: blueprint:javascript_auth_all_persistance
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import bcrypt from "bcrypt";
import { storage } from "./storage";
import { z } from "zod";
import { User as SelectUser } from "@shared/schema";
import { createAndSendVerificationToken, isEmailVerified } from "./emailVerification";
import { logger } from "./logger";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const SALT_ROUNDS = 10;

async function hashPassword(password: string) {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

async function comparePasswords(supplied: string, stored: string) {
  return await bcrypt.compare(supplied, stored);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const identifier = (username || "").trim();
        // Try username first (case-insensitive handled in storage)
        let user = await storage.getUserByUsername(identifier);
        // If not found, try email (normalized to lowercase in storage)
        if (!user) {
          user = await storage.getUserByEmail(identifier.toLowerCase());
        }

        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false, { message: "Invalid username or password" });
        }

        // Check if email is verified (only if user has an email)
        if (user.email) {
          const verified = await isEmailVerified(user.id);
          if (!verified) {
            return done(null, false, { 
              message: "Please verify your email address before logging in. Check your inbox and spam folder for the verification email."
            });
          }
        }

        return done(null, user);
      } catch (e) {
        return done(e);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }
      done(null, user);
    } catch (error) {
      done(error, false);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    const registerSchema = z.object({
      username: z.string().min(3, "Username must be at least 3 characters"),
      password: z.string().min(6, "Password must be at least 6 characters"),
      email: z.string().email("Invalid email address").transform(v => v.trim().toLowerCase()),
      role: z.number().optional(),
    });

    try {
      const parsed = registerSchema.parse(req.body);

      // Check username uniqueness (case-insensitive)
      const existingUser = await storage.getUserByUsername(parsed.username);
      if (existingUser) {
        logger.warn(`Registration failed: Username already exists`, {
          source: 'auth.register',
          req,
          errorCode: 'USERNAME_EXISTS',
          metadata: { username: parsed.username },
        });
        return res.status(400).json({ message: "Username already exists" });
      }

      // Check email uniqueness (case-insensitive)
      const existingEmail = await storage.getUserByEmail(parsed.email);
      if (existingEmail) {
        logger.warn(`Registration failed: Email already in use`, {
          source: 'auth.register',
          req,
          errorCode: 'EMAIL_EXISTS',
          metadata: { email: parsed.email },
        });
        return res.status(400).json({ message: "Email already in use" });
      }

      const user = await storage.createUser({
        username: parsed.username,
        password: await hashPassword(parsed.password),
        email: parsed.email,
        role: parsed.role ?? 0,
      } as any);

      logger.info(`User registered successfully: ${user.username}`, {
        source: 'auth.register',
        userId: user.id,
        req,
        metadata: { username: user.username, email: parsed.email },
      });

      // Send verification email (don't fail registration if email fails)
      const emailResult = await createAndSendVerificationToken(
        user.id,
        parsed.email,
        parsed.username
      );

      if (!emailResult.success) {
        logger.error(`Failed to send verification email`, emailResult.error || new Error('Unknown error'), {
          source: 'auth.register',
          userId: user.id,
          req,
          errorCode: 'EMAIL_SEND_FAILED',
          metadata: { email: parsed.email },
        });
        // Continue with registration even if email fails
      }

      req.login(user, (err) => {
        if (err) {
          logger.error(`Login after registration failed`, err, {
            source: 'auth.register',
            userId: user.id,
            req,
            errorCode: 'LOGIN_AFTER_REGISTER_FAILED',
          });
          return next(err);
        }
        res.status(201).json({
          ...user,
          emailVerificationSent: emailResult.success,
          message: emailResult.success 
            ? 'Registration successful! Please check your email (including spam folder) to verify your account.' 
            : 'Registration successful! However, we could not send a verification email. Please try resending it from your account.'
        });
      });
    } catch (error: any) {
      if (error?.issues) {
        // Don't log validation errors - too noisy
        return res.status(400).json({ message: error.issues[0]?.message || "Invalid input" });
      }
      logger.error(`Registration error`, error, {
        source: 'auth.register',
        req,
        errorCode: 'REGISTRATION_ERROR',
      });
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    const username = req.body.username;

    passport.authenticate("local", (err: any, user: SelectUser | false, info: any) => {
      if (err) {
        logger.error(`Login authentication error`, err, {
          source: 'auth.login',
          req,
          errorCode: 'LOGIN_AUTH_ERROR',
          metadata: { username },
        });
        return next(err);
      }
      
      if (!user) {
        // Only log failed login attempts, not every attempt
        logger.warn(`Login failed for username: ${username}`, {
          source: 'auth.login',
          req,
          errorCode: 'LOGIN_FAILED',
          metadata: { username, reason: info?.message },
        });
        // Return the specific error message from the strategy (e.g., email verification required)
        return res.status(401).json({ 
          message: info?.message || "Invalid username or password" 
        });
      }
      
      req.login(user, (err) => {
        if (err) {
          logger.error(`Login session creation failed`, err, {
            source: 'auth.login',
            userId: user.id,
            req,
            errorCode: 'LOGIN_SESSION_ERROR',
            metadata: { username: user.username },
          });
          return next(err);
        }
        
        // Log successful logins
        logger.info(`User logged in: ${user.username}`, {
          source: 'auth.login',
          userId: user.id,
          req,
          metadata: { username: user.username },
        });
        
        res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    const userId = (req.user as SelectUser)?.id;
    const username = (req.user as SelectUser)?.username;
    
    // Don't log every logout, only if there's an error
    req.logout((err) => {
      if (err) {
        logger.error(`Logout error`, err, {
          source: 'auth.logout',
          userId,
          req,
          errorCode: 'LOGOUT_ERROR',
        });
        return next(err);
      }
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
}
