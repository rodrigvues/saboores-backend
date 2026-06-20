import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env } from "../config/env.js";

/** Claims do access token (sessão). `sub` é o id do usuário. */
export interface AccessTokenClaims {
  sub: string;
  role: Role;
  email: string;
}

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, env.jwtSecret, {
    expiresIn: env.accessTokenTtl as SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const decoded = jwt.verify(token, env.jwtSecret);

  if (typeof decoded === "string") {
    throw new Error("Token inválido.");
  }

  return {
    sub: String(decoded.sub),
    role: decoded.role as Role,
    email: String(decoded.email),
  };
}
