import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";

const router: IRouter = Router();

function getCode(): string | null {
  return process.env.APP_ACCESS_CODE || null;
}

function makeToken(code: string): string {
  return crypto.createHmac("sha256", code + (process.env.APP_TOKEN_SECRET || "stockcheck-secret"))
    .update("authenticated")
    .digest("hex");
}

// Is auth required?
router.get("/auth/status", (_req: Request, res: Response) => {
  const code = getCode();
  res.json({ required: !!code });
});

// Verify access code, return session token
router.post("/auth/verify", (req: Request, res: Response) => {
  const code = getCode();
  if (!code) {
    // No code configured = open access
    res.json({ success: true, token: "open" });
    return;
  }
  const { accessCode } = req.body;
  if (!accessCode || typeof accessCode !== "string") {
    res.status(400).json({ success: false, error: "Code requis" });
    return;
  }
  // Constant-time comparison
  const inputBuf = Buffer.from(accessCode.trim());
  const codeBuf = Buffer.from(code.trim());
  const match = inputBuf.length === codeBuf.length && crypto.timingSafeEqual(inputBuf, codeBuf);
  if (!match) {
    res.status(401).json({ success: false, error: "Code incorrect" });
    return;
  }
  res.json({ success: true, token: makeToken(code) });
});

// Validate an existing token
router.post("/auth/validate", (req: Request, res: Response) => {
  const code = getCode();
  if (!code) { res.json({ valid: true }); return; }
  const { token } = req.body;
  if (!token) { res.json({ valid: false }); return; }
  const expected = makeToken(code);
  try {
    const valid = token === "open" || (
      token.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    );
    res.json({ valid });
  } catch {
    res.json({ valid: false });
  }
});

export default router;
