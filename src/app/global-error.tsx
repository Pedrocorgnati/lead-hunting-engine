'use client'

// global-error.tsx captura erros do proprio root layout (que error.tsx nao alcanca).
// Next.js exige que este componente renderize sua propria <html> e <body> porque
// substitui o root layout quando o erro acontece nele.
// Referencia: https://nextjs.org/docs/app/api-reference/file-conventions/error#global-error

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="pt-BR">
      <body>
        <main
          data-testid="global-error-page"
          style={{
            display: 'flex',
            minHeight: '100vh',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.5rem',
            padding: '1rem',
            textAlign: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            backgroundColor: '#0a0a0a',
            color: '#fafafa',
          }}
        >
          <div
            style={{
              borderRadius: '9999px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              padding: '1.5rem',
              fontSize: '2rem',
            }}
            aria-hidden={true}
          >
            ⚠️
          </div>

          <div style={{ maxWidth: '28rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Erro critico na aplicacao
            </h1>
            <p style={{ fontSize: '0.95rem', opacity: 0.8 }}>
              Ocorreu um erro inesperado no carregamento principal. Por favor, recarregue a
              pagina ou tente novamente.
            </p>
            {error.digest && (
              <p
                style={{
                  fontSize: '0.75rem',
                  marginTop: '0.75rem',
                  fontFamily: 'monospace',
                  opacity: 0.6,
                }}
              >
                ID: {error.digest}
              </p>
            )}
          </div>

          <button
            onClick={reset}
            data-testid="global-error-retry-button"
            style={{
              padding: '0.625rem 1rem',
              backgroundColor: '#fafafa',
              color: '#0a0a0a',
              fontSize: '0.875rem',
              fontWeight: 500,
              borderRadius: '0.375rem',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  )
}
