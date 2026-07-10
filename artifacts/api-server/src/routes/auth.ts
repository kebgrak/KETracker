import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { db, settingsTable, operatorsTable } from "@workspace/db";
import { eq, and, isNotNull, ilike } from "drizzle-orm";

const router = Router();

const ADMIN_KEY = "admin_password_hash";
const MODERATOR_KEY = "moderator_password_hash";

// ── Rate limiters ─────────────────────────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait 15 minutes and try again." },
  skipSuccessfulRequests: true,
});

const resetLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many reset attempts. Please wait 30 minutes and try again." },
  skipSuccessfulRequests: true,
});

const changeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait 15 minutes and try again." },
  skipSuccessfulRequests: true,
});

// ── Generic password helpers ──────────────────────────────────────────────────

async function getStoredHash(key: string): Promise<string | null> {
  try {
    const row = await db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.key, key))
      .limit(1);
    return row[0]?.value ?? null;
  } catch {
    return null;
  }
}

async function storeHash(key: string, newPassword: string): Promise<void> {
  const hash = await bcrypt.hash(newPassword, 12);
  const existing = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.key, key))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(settingsTable)
      .set({ value: hash, updatedAt: new Date() })
      .where(eq(settingsTable.key, key));
  } else {
    await db.insert(settingsTable).values({ key, value: hash });
  }
}

async function verifyAdminPassword(plain: string): Promise<boolean> {
  const hash = await getStoredHash(ADMIN_KEY);
  const envPassword = process.env["ADMIN_PASSWORD"];
  const isElectronManaged = envPassword === "__electron_managed__";

  // In Electron mode, the hash is always stored in the DB settings table
  if (hash) return bcrypt.compare(plain, hash);

  // No DB hash yet — fall back to env var (first launch or non-Electron)
  if (isElectronManaged) return false;
  return !!envPassword && plain === envPassword;
}

async function verifyModeratorPassword(plain: string): Promise<boolean> {
  const hash = await getStoredHash(MODERATOR_KEY);
  if (hash) return bcrypt.compare(plain, hash);
  // Fall back to env secret (same pattern as admin)
  const envPassword = process.env["MODERATOR_PASSWORD"];
  return !!envPassword && plain === envPassword;
}

// ── Email helper ──────────────────────────────────────────────────────────────

async function notifyAdmins(): Promise<{ sent: number; skipped: boolean }> {
  const smtpHost = process.env["SMTP_HOST"];
  const smtpUser = process.env["SMTP_USER"];
  const smtpPass = process.env["SMTP_PASS"];
  const smtpFrom = process.env["SMTP_FROM"] ?? smtpUser;
  const smtpPort = Number(process.env["SMTP_PORT"] ?? "587");

  if (!smtpHost || !smtpUser || !smtpPass) {
    return { sent: 0, skipped: true };
  }

  const admins = await db
    .select({ name: operatorsTable.name, email: operatorsTable.email })
    .from(operatorsTable)
    .where(
      and(
        eq(operatorsTable.isAdmin, true),
        isNotNull(operatorsTable.email)
      )
    );

  const recipients = admins.filter((a) => a.email && a.email.trim() !== "");
  if (recipients.length === 0) {
    return { sent: 0, skipped: false };
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });

  const now = new Date().toLocaleString();
  await Promise.all(
    recipients.map((admin) =>
      transporter.sendMail({
        from: smtpFrom,
        to: admin.email!,
        subject: "Production Tracker — Admin password changed",
        text: `Hello ${admin.name},\n\nThe admin password for Production Tracker was changed on ${now}.\n\nIf you did not request this change, please contact your system administrator immediately.\n\nThis is an automated notification.`,
        html: `<p>Hello <strong>${admin.name}</strong>,</p><p>The admin password for <strong>Production Tracker</strong> was changed on <strong>${now}</strong>.</p><p>If you did not request this change, please contact your system administrator immediately.</p><p style="color:#888;font-size:12px">This is an automated notification.</p>`,
      })
    )
  );

  return { sent: recipients.length, skipped: false };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Admin login
router.post("/auth/login", loginLimiter, async (req, res) => {
  const { password } = req.body as { password?: string };
  const adminPassword = process.env["ADMIN_PASSWORD"];
  const hash = await getStoredHash(ADMIN_KEY);

  if (!adminPassword && !hash) {
    res.status(503).json({ error: "Admin password not configured on server." });
    return;
  }

  if (!password) {
    res.status(401).json({ error: "Incorrect password." });
    return;
  }

  const valid = await verifyAdminPassword(password);
  if (!valid) {
    res.status(401).json({ error: "Incorrect password." });
    return;
  }

  req.session.isAdmin = true;
  req.session.isModerator = undefined;
  res.json({ authenticated: true, role: "admin" });
});

// Moderator login
router.post("/auth/moderator-login", loginLimiter, async (req, res) => {
  const { password } = req.body as { password?: string };

  if (!password) {
    res.status(401).json({ error: "Incorrect password." });
    return;
  }

  const hash = await getStoredHash(MODERATOR_KEY);
  if (!hash) {
    res.status(503).json({ error: "Moderator password has not been configured. Please contact an administrator." });
    return;
  }

  const valid = await verifyModeratorPassword(password);
  if (!valid) {
    res.status(401).json({ error: "Incorrect password." });
    return;
  }

  req.session.isModerator = true;
  req.session.isAdmin = undefined;
  res.json({ authenticated: true, role: "moderator" });
});

// Logout
router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ authenticated: false });
  });
});

// Auth status — returns role
router.get("/auth/status", (req, res) => {
  if (req.session.isAdmin) {
    res.json({ authenticated: true, role: "admin" });
  } else if (req.session.isModerator) {
    res.json({ authenticated: true, role: "moderator" });
  } else {
    res.json({ authenticated: false, role: null });
  }
});

// Change admin password — admin only
router.post("/auth/change-password", changeLimiter, async (req, res) => {
  if (!req.session.isAdmin) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }

  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Current and new password are required." });
    return;
  }

  if (newPassword.length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters." });
    return;
  }

  const valid = await verifyAdminPassword(currentPassword);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect." });
    return;
  }

  await storeHash(ADMIN_KEY, newPassword);
  res.json({ success: true });
});

// Set moderator password — admin only
router.post("/auth/set-moderator-password", changeLimiter, async (req, res) => {
  if (!req.session.isAdmin) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }

  const { newPassword } = req.body as { newPassword?: string };

  if (!newPassword) {
    res.status(400).json({ error: "New password is required." });
    return;
  }

  if (newPassword.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters." });
    return;
  }

  await storeHash(MODERATOR_KEY, newPassword);
  res.json({ success: true });
});

// Check whether moderator password is configured — admin only
router.get("/auth/moderator-password-status", async (req, res) => {
  if (!req.session.isAdmin) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  const hash = await getStoredHash(MODERATOR_KEY);
  res.json({ configured: !!hash });
});

// Reset password — email must match a known admin operator; sets new password and emails all admins
router.post("/auth/reset-password", resetLimiter, async (req, res) => {
  const { email, newPassword } = req.body as { email?: string; newPassword?: string };

  if (!email || !newPassword) {
    res.status(400).json({ error: "Email address and new password are required." });
    return;
  }

  if (newPassword.length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters." });
    return;
  }

  const adminWithEmail = await db
    .select({ id: operatorsTable.id })
    .from(operatorsTable)
    .where(
      and(
        eq(operatorsTable.isAdmin, true),
        ilike(operatorsTable.email, email.trim())
      )
    )
    .limit(1);

  if (adminWithEmail.length === 0) {
    res.status(401).json({ error: "Email address does not match any administrator account." });
    return;
  }

  await storeHash(ADMIN_KEY, newPassword);

  const emailResult = await notifyAdmins().catch(() => ({ sent: 0, skipped: true }));

  res.json({ success: true, emailsSent: emailResult.sent, emailSkipped: emailResult.skipped });
});

export default router;
