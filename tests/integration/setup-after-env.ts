/**
 * Teardown por arquivo: desconecta o singleton do Prisma ao fim de cada
 * suite. Sem isso, pools pg orfaos disparavam apos o teardown do ambiente
 * jest ("Cannot read properties of undefined (reading 'Socket')"), matando
 * o runner antes do summary.
 */
afterAll(async () => {
  // Drena IO fire-and-forget dos routes (audit/loginAttempt) ANTES do
  // disconnect — um create tardio apos $disconnect recriava o pool ja com o
  // ambiente desmontado e derrubava o processo.
  await new Promise((resolve) => setTimeout(resolve, 300))
  try {
    const { prisma } = await import('@/lib/prisma')
    await prisma.$disconnect()
  } catch {
    // modulo pode estar mockado na suite — nada a desconectar
  }
})
