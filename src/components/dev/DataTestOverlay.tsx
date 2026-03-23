'use client'

import { useState, useCallback, useEffect } from 'react'

/**
 * DevDataTestOverlay — Overlay visual de debug para data-testid
 *
 * SOMENTE para ambiente de desenvolvimento.
 * Este componente NUNCA deve aparecer em producao.
 *
 * Funcionalidade:
 * - Botao flutuante [data-test] no canto superior direito
 * - Ao clicar, exibe overlays com todos os data-testid do DOM
 * - Ao clicar em um overlay, copia o data-testid para o clipboard
 * - Segundo clique no botao esconde todos os overlays
 */

export function DevDataTestOverlay() {
  const [isActive, setIsActive] = useState(false)
  const [elements, setElements] = useState<Array<{ id: string; rect: DOMRect }>>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Camada 1: verificacao de ambiente (APOS hooks — Rules of Hooks exige chamada incondicional)
  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  const scanDataTestIds = useCallback(() => {
    const allElements = document.querySelectorAll('[data-testid]')
    const mapped = Array.from(allElements).map((el) => ({
      id: el.getAttribute('data-testid')!,
      rect: el.getBoundingClientRect(),
    }))
    setElements(mapped)
  }, [])

  const handleToggle = useCallback(() => {
    if (!isActive) {
      scanDataTestIds()
    }
    setIsActive((prev) => !prev)
  }, [isActive, scanDataTestIds])

  const handleCopy = useCallback(async (testId: string) => {
    const copyText = `data-testid="${testId}"`
    try {
      await navigator.clipboard.writeText(copyText)
      setCopiedId(testId)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      // Fallback para browsers que nao suportam clipboard API
      const textArea = document.createElement('textarea')
      textArea.value = copyText
      textArea.style.position = 'fixed'
      textArea.style.left = '-9999px'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopiedId(testId)
      setTimeout(() => setCopiedId(null), 1500)
    }
  }, [])

  // Atualizar posicoes no scroll e resize
  useEffect(() => {
    if (!isActive) return

    const handleUpdate = () => scanDataTestIds()

    window.addEventListener('scroll', handleUpdate, true)
    window.addEventListener('resize', handleUpdate)

    return () => {
      window.removeEventListener('scroll', handleUpdate, true)
      window.removeEventListener('resize', handleUpdate)
    }
  }, [isActive, scanDataTestIds])

  return (
    <>
      {/* Botao flutuante */}
      <button
        onClick={handleToggle}
        style={{
          position: 'fixed',
          top: '12px',
          right: '12px',
          zIndex: 99999,
          padding: '6px 12px',
          fontSize: '12px',
          fontWeight: 600,
          fontFamily: 'monospace',
          border: '2px solid',
          borderColor: isActive ? '#ffffff' : '#ef4444',
          borderRadius: '6px',
          backgroundColor: isActive ? '#ef4444' : '#ffffff',
          color: isActive ? '#ffffff' : '#ef4444',
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          transition: 'all 150ms ease',
          userSelect: 'none',
        }}
        aria-label={isActive ? 'Esconder data-testid overlays' : 'Mostrar data-testid overlays'}
      >
        [data-test]
      </button>

      {/* Overlays dos data-testid */}
      {isActive &&
        elements.map((el) => (
          <button
            key={`${el.id}-${el.rect.top}-${el.rect.left}`}
            onClick={() => handleCopy(el.id)}
            title={`Clique para copiar: ${el.id}`}
            style={{
              position: 'fixed',
              top: `${el.rect.top}px`,
              left: `${el.rect.left}px`,
              zIndex: 99998,
              padding: '2px 6px',
              fontSize: '10px',
              fontWeight: 600,
              fontFamily: 'monospace',
              backgroundColor: copiedId === el.id ? '#16a34a' : '#ef4444',
              color: '#ffffff',
              borderRadius: '3px',
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              pointerEvents: 'auto',
              boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
              transition: 'background-color 150ms ease',
              lineHeight: '1.4',
            }}
          >
            {copiedId === el.id ? 'Copiado!' : el.id}
          </button>
        ))}
    </>
  )
}
