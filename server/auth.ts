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
        return res.status(400).json({ message: "Username already exists" });
      }

      // Check email uniqueness (case-insensitive)
      const existingEmail = await storage.getUserByEmail(parsed.email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already in use" });
      }

      const user = await storage.createUser({
        username: parsed.username,
        password: await hashPassword(parsed.password),
        email: parsed.email,
        role: parsed.role ?? 0,
      } as any);

      // Send verification email (don't fail registration if email fails)
      const emailResult = await createAndSendVerificationToken(
        user.id,
        parsed.email,
        parsed.username
      );

      if (!emailResult.success) {
        console.warn(`Failed to send verification email to ${parsed.email}:`, emailResult.error);
        // Continue with registration even if email fails
      }

      req.login(user, (err) => {
        if (err) return next(err);
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
        return res.status(400).json({ message: error.issues[0]?.message || "Invalid input" });
      }
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: SelectUser | false, info: any) => {
      if (err) return next(err);
      if (!user) {
        // Return the specific error message from the strategy (e.g., email verification required)
        return res.status(401).json({ 
          message: info?.message || "Invalid username or password" 
        });
      }
      req.login(user, (err) => {
        if (err) return next(err);
        res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
}
