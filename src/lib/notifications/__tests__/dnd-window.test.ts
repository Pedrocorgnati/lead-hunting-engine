import { timeInDndWindow } from '../dispatcher'

describe('timeInDndWindow (item 037)', () => {
  it('janela no mesmo dia: dentro/fora', () => {
    expect(timeInDndWindow('13:00', '12:00', '14:00')).toBe(true)
    expect(timeInDndWindow('12:00', '12:00', '14:00')).toBe(true)
    expect(timeInDndWindow('14:00', '12:00', '14:00')).toBe(false)
    expect(timeInDndWindow('11:59', '12:00', '14:00')).toBe(false)
  })

  it('janela cruzando meia-noite (22:00-07:00)', () => {
    expect(timeInDndWindow('23:30', '22:00', '07:00')).toBe(true)
    expect(timeInDndWindow('03:00', '22:00', '07:00')).toBe(true)
    expect(timeInDndWindow('07:00', '22:00', '07:00')).toBe(false)
    expect(timeInDndWindow('12:00', '22:00', '07:00')).toBe(false)
  })

  it('start == end significa janela desativada', () => {
    expect(timeInDndWindow('10:00', '10:00', '10:00')).toBe(false)
  })
})
