import { z } from 'zod'

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('SUPABASE_URL deve ser uma URL válida'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'SUPABASE_ANON_KEY é obrigatória'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SERVICE_ROLE_KEY é obrigatória'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL é obrigatória'),
  ENCRYPTION_KEY: z
    .string()
    .length(64, 'ENCRYPTION_KEY deve ter exatamente 64 chars (32 bytes hex)')
    .regex(/^[0-9a-f]+$/i, 'ENCRYPTION_KEY deve ser hexadecimal'),
  TRIGGER_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url('APP_URL deve ser uma URL válida'),
  INSTAGRAM_GRAPH_TOKEN: z.string().optional(),
  FACEBOOK_GRAPH_TOKEN: z.string().optional(),
  CRON_SECRET_KEY: z.string().optional(),
  // TASK-1/ST006 (CL-309): analytics da landing (opcionais em dev)
  NEXT_PUBLIC_GA_ID: z
    .string()
    .regex(/^G-[A-Z0-9]+$/, 'NEXT_PUBLIC_GA_ID deve comecar com "G-"')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  NEXT_PUBLIC_PLAUSIBLE_DOMAIN: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Variáveis de ambiente inválidas:')
  console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2))
  throw new Error('Variáveis de ambiente inválidas. Verifique .env.local')
}

export const env = parsed.data
