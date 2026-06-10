jest.mock('sonner', () => ({
  Toaster: () => null,
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
  },
}))

import { notify } from '../ToastCenter'
import { toast as sonnerToast } from 'sonner'

const mocked = sonnerToast as unknown as Record<'success' | 'error' | 'warning' | 'info', jest.Mock>

beforeEach(() => jest.clearAllMocks())

describe('ToastCenter notify (item 060 / C9)', () => {
  it.each(['success', 'error', 'warning', 'info'] as const)(
    'notify.%s delega para sonner com a mensagem',
    (severity) => {
      notify[severity]('mensagem de teste')
      expect(mocked[severity]).toHaveBeenCalledWith('mensagem de teste', undefined)
    },
  )

  it('repassa duration e action para o sonner', () => {
    const onClick = jest.fn()
    notify.error('falhou', { duration: 8000, action: { label: 'Tentar', onClick } })
    expect(mocked.error).toHaveBeenCalledWith('falhou', {
      duration: 8000,
      action: { label: 'Tentar', onClick },
    })
  })
})
