/**
 * Global Setup — executado uma vez antes de todos os testes de integração.
 *
 * Responsabilidades:
 *   1. Verificar variáveis de ambiente obrigatórias
 *   2. Executar seed de teste para garantir dados base
 *
 * Para criar usuários Supabase Auth com IDs fixos (necessário para auth real),
 * execute manualmente antes dos testes:
 *
 *   npx tsx tests/integration/scripts/create-test-auth-users.ts
 *
 * Ou use autenticação mockada (padrão desta suite) que não requer usuários reais.
 */
export default async function globalSetup() {
  const requiredEnvVars = ['DATABASE_URL']
  const missing = requiredEnvVars.filter((v) => !process.env[v])

  if (missing.length > 0) {
    console.warn(
      `\n⚠️  Variáveis de ambiente ausentes para testes de integração: ${missing.join(', ')}`,
      '\n   Configure .env.test.local e execute: bun run seed:test\n',
    )
  }

  console.log('✓ Integration test suite iniciada')
}
