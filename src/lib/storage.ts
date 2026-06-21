import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";

/**
 * Cliente Supabase (service role) para o Storage de avatares. `null` quando as
 * credenciais não estão configuradas — nesse caso o upload retorna erro claro.
 *
 * SETUP: ver docs/CONFIGURACAO-NECESSARIA.md (Supabase Storage).
 */
const client: SupabaseClient | null =
  env.supabaseUrl && env.supabaseServiceRoleKey
    ? createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
        auth: { persistSession: false },
      })
    : null;

export const isStorageConfigured = client !== null;

/**
 * Sobe (ou substitui) o avatar do usuário. Usa uma CHAVE FIXA por usuário
 * (`<userId>`), com `upsert` — assim cada novo upload sobrescreve o anterior e
 * não gera órfãos. A URL ganha `?v=<timestamp>` para furar cache do navegador.
 */
export async function uploadAvatar(params: {
  userId: string;
  buffer: Buffer;
  contentType: string;
}): Promise<string> {
  if (!client) {
    // SETUP: ver docs/CONFIGURACAO-NECESSARIA.md (Supabase Storage).
    throw new HttpError(
      503,
      "Upload de avatar indisponível: o storage ainda não foi configurado.",
    );
  }

  const bucket = env.supabaseAvatarBucket;
  const path = params.userId;

  const { error } = await client.storage.from(bucket).upload(path, params.buffer, {
    contentType: params.contentType,
    upsert: true,
  });
  if (error) {
    console.error("[storage] falha no upload do avatar:", error);
    throw new HttpError(502, "Não foi possível enviar a imagem. Tente novamente.");
  }

  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}
