import {
  TONE_OPTIONS,
  TONE_DESCRIPTIONS,
  TONE_SYSTEM_PROMPTS,
} from '@/lib/pitch/tone-config'

describe('tone-config', () => {
  it('TONE_OPTIONS possui exatamente 3 valores', () => {
    expect(TONE_OPTIONS).toHaveLength(3)
  })

  it('TONE_DESCRIPTIONS cobre todos os TONE_OPTIONS', () => {
    for (const tone of TONE_OPTIONS) {
      expect(TONE_DESCRIPTIONS[tone]).toBeDefined()
    }
  })

  it('TONE_SYSTEM_PROMPTS cobre todos os TONE_OPTIONS', () => {
    for (const tone of TONE_OPTIONS) {
      expect(TONE_SYSTEM_PROMPTS[tone]).toBeDefined()
    }
  })

  it('não possui strings vazias em descriptions nem prompts', () => {
    for (const tone of TONE_OPTIONS) {
      expect(TONE_DESCRIPTIONS[tone].trim()).not.toBe('')
      expect(TONE_SYSTEM_PROMPTS[tone].trim()).not.toBe('')
    }
  })
})
