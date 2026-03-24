// Ambiente de testes — ST004 (TASK-AUDIT-1)
// Define variáveis de ambiente necessárias para inicializar módulos em testes
// (ex: Prisma Proxy, CryptoUtil). Não usa banco real — mocks são aplicados nos testes.
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db'
process.env.ENCRYPTION_KEY = 'a'.repeat(64) // 32-byte hex para testes
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
