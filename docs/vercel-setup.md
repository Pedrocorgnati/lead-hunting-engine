# Vercel Setup — Lead Hunting Engine

## Região

- `gru1` (São Paulo) — menor latência para usuários BR

## Environment Variables

Configurar em Vercel Dashboard → Settings → Environment Variables:

| Variável | Ambiente | Observação |
|----------|----------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview | Chave pública anon |
| `SUPABASE_SERVICE_ROLE_KEY` | Production, Preview | Chave privada — marcar como "Sensitive" |
| `DATABASE_URL` | Production, Preview | Pooler — porta 6543 com `?pgbouncer=true` |
| `DIRECT_URL` | Production, Preview | Direct — porta 5432 sem parâmetro pgbouncer |
| `ENCRYPTION_KEY` | Production, Preview | 64 chars hex — marcar como "Sensitive" |
| `TRIGGER_SECRET_KEY` | Production | Necessário para módulos 10+ |
| `NEXT_PUBLIC_APP_URL` | Production | URL do domínio final (ex: https://lead-hunting.vercel.app) |

## GitHub Secrets (para CI/CD)

Configurar em GitHub Repository → Settings → Secrets and variables → Actions:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `DATABASE_URL`
- `DIRECT_URL`
- `ENCRYPTION_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Deploy automático

- Push para `main` → deploy em Production
- Push para outras branches → Preview Deploy

## Verificação pós-deploy

```bash
curl https://[seu-dominio].vercel.app/api/health
# Esperado: {"status":"ok","db":"connected","timestamp":"..."}
```

## Gerar ENCRYPTION_KEY

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# ou
openssl rand -hex 32
```
