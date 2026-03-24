# Supabase Setup — Lead Hunting Engine

## Configurações Manuais (não automatizáveis via código)

### 1. Email Templates

**Localização:** Authentication → Email Templates no Supabase Dashboard

#### Invite User

```html
<h2>Você foi convidado para o Lead Hunting Engine</h2>
<p>Olá,</p>
<p>Você foi convidado para acessar o Lead Hunting Engine. Clique no link abaixo para ativar sua conta:</p>
<p><a href="{{ .SiteURL }}/invite/{{ .Token }}">Ativar minha conta</a></p>
<p>Este link expira em {{ .TokenExpiry }}.</p>
<p>Se você não esperava este convite, pode ignorar este email com segurança.</p>
<hr>
<p style="font-size: 12px; color: #666;">Lead Hunting Engine — Ferramenta de prospecção B2B</p>
```

#### Reset Password

```html
<h2>Redefinir senha — Lead Hunting Engine</h2>
<p>Olá,</p>
<p>Recebemos uma solicitação para redefinir a senha da sua conta. Clique no link abaixo:</p>
<p><a href="{{ .SiteURL }}/auth/reset-password?token={{ .Token }}">Redefinir minha senha</a></p>
<p>Se você não solicitou este email, ignore-o — sua senha permanece segura.</p>
<p>O link expira em 1 hora.</p>
<hr>
<p style="font-size: 12px; color: #666;">Lead Hunting Engine — Ferramenta de prospecção B2B</p>
```

### 2. URL Configuration

**Localização:** Authentication → URL Configuration

| Campo | Valor |
|-------|-------|
| Site URL | `https://[seu-dominio.vercel.app]` |
| Redirect URLs | `https://[seu-dominio.vercel.app]/**` |

> Em desenvolvimento local: adicionar também `http://localhost:3000/**`

### 3. RLS Policies

As políticas RLS estão documentadas em `prisma/rls-policies.sql`.

**Como aplicar:**
1. Abrir o Supabase Dashboard → SQL Editor
2. Colar o conteúdo de `prisma/rls-policies.sql`
3. Executar o arquivo INTEIRO (não executar por partes)
4. Verificar resultado em `docs/rls-validation.md`

### 4. Environment Variables

Configurar em Supabase Dashboard não é necessário — as variáveis são gerenciadas no `.env.local` (desenvolvimento) e no Vercel Dashboard (produção).

Ver `docs/vercel-setup.md` para configuração de produção.

## Troubleshooting

| Problema | Causa | Solução |
|----------|-------|---------|
| Email de convite com link errado | Site URL não configurado | Configurar em Authentication → URL Configuration |
| Email não entregue em produção | SMTP não configurado | Verificar Dashboard → Logs → Auth |
| RLS bloqueando todas as queries | Policy criada mas `ENABLE ROW LEVEL SECURITY` não executado | Re-executar rls-policies.sql completo |
