import { describe, it, expect } from 'vitest'
import {
  isSameDay,
  getShutdownDate,
  computeNotionStatus,
  parseNotionPages,
  type RawEntry,
} from '../notion'

function makeEntry(dateStr: string, checked: boolean, lastEdited?: string): RawEntry {
  return {
    date: new Date(dateStr + 'T12:00:00Z'),
    checked,
    lastEdited,
  }
}

describe('isSameDay', () => {
  it('returns true for same UTC day', () => {
    expect(isSameDay(
      new Date('2026-03-18T03:00:00Z'),
      new Date('2026-03-18T23:00:00Z')
    )).toBe(true)
  })

  it('returns false for different UTC days', () => {
    expect(isSameDay(
      new Date('2026-03-18T23:00:00Z'),
      new Date('2026-03-19T01:00:00Z')
    )).toBe(false)
  })

  it('returns false across months', () => {
    expect(isSameDay(
      new Date('2026-01-31T12:00:00Z'),
      new Date('2026-02-01T12:00:00Z')
    )).toBe(false)
  })
})

describe('getShutdownDate', () => {
  it('sets hours and minutes on the given date', () => {
    const date = new Date('2026-03-18T12:00:00Z')
    const result = getShutdownDate(date, '21:00')
    expect(result.getUTCHours()).toBe(21)
    expect(result.getUTCMinutes()).toBe(0)
    expect(result.getUTCDate()).toBe(18)
  })

  it('handles non-zero minutes', () => {
    const date = new Date('2026-03-18T12:00:00Z')
    const result = getShutdownDate(date, '14:30')
    expect(result.getUTCHours()).toBe(14)
    expect(result.getUTCMinutes()).toBe(30)
  })
})

describe('computeNotionStatus', () => {
  const shutdownTime = '21:00'

  describe('canStart', () => {
    it('returns canStart=true when today is checked', () => {
      const now = new Date('2026-03-18T15:00:00Z')
      const entries = [makeEntry('2026-03-18', true)]
      const result = computeNotionStatus(entries, true, shutdownTime, now)
      expect(result.canStart).toBe(true)
    })

    it('returns canStart=true when yesterday is checked', () => {
      const now = new Date('2026-03-18T15:00:00Z')
      const entries = [makeEntry('2026-03-17', true)]
      const result = computeNotionStatus(entries, true, shutdownTime, now)
      expect(result.canStart).toBe(true)
    })

    it('returns canStart=false when neither today nor yesterday is checked', () => {
      const now = new Date('2026-03-18T15:00:00Z')
      const entries = [makeEntry('2026-03-16', true)]
      const result = computeNotionStatus(entries, true, shutdownTime, now)
      expect(result.canStart).toBe(false)
    })

    it('returns canStart=false when no entries exist', () => {
      const now = new Date('2026-03-18T15:00:00Z')
      const result = computeNotionStatus([], true, shutdownTime, now)
      expect(result.canStart).toBe(false)
    })

    it('returns canStart=false when today exists but not checked', () => {
      const now = new Date('2026-03-18T15:00:00Z')
      const entries = [makeEntry('2026-03-18', false)]
      const result = computeNotionStatus(entries, true, shutdownTime, now)
      expect(result.canStart).toBe(false)
    })
  })

  describe('streak', () => {
    it('returns streak=0 when nothing checked', () => {
      const now = new Date('2026-03-18T15:00:00Z')
      const result = computeNotionStatus([], true, shutdownTime, now)
      expect(result.streak).toBe(0)
    })

    it('returns streak=1 when only today is checked', () => {
      const now = new Date('2026-03-18T15:00:00Z')
      const entries = [makeEntry('2026-03-18', true)]
      const result = computeNotionStatus(entries, true, shutdownTime, now)
      expect(result.streak).toBe(1)
    })

    it('returns streak=3 for three consecutive days ending today', () => {
      const now = new Date('2026-03-18T15:00:00Z')
      const entries = [
        makeEntry('2026-03-18', true),
        makeEntry('2026-03-17', true),
        makeEntry('2026-03-16', true),
      ]
      const result = computeNotionStatus(entries, true, shutdownTime, now)
      expect(result.streak).toBe(3)
    })

    it('returns streak=2 for consecutive days ending yesterday (today unchecked)', () => {
      const now = new Date('2026-03-18T15:00:00Z')
      const entries = [
        makeEntry('2026-03-18', false),
        makeEntry('2026-03-17', true),
        makeEntry('2026-03-16', true),
      ]
      const result = computeNotionStatus(entries, true, shutdownTime, now)
      expect(result.streak).toBe(2)
    })

    it('breaks streak on gap', () => {
      const now = new Date('2026-03-18T15:00:00Z')
      const entries = [
        makeEntry('2026-03-18', true),
        makeEntry('2026-03-17', true),
        // gap on 2026-03-16
        makeEntry('2026-03-15', true),
      ]
      const result = computeNotionStatus(entries, true, shutdownTime, now)
      expect(result.streak).toBe(2)
    })

    it('returns streak=0 when only old entries are checked (not today or yesterday)', () => {
      const now = new Date('2026-03-18T15:00:00Z')
      const entries = [
        makeEntry('2026-03-15', true),
        makeEntry('2026-03-14', true),
      ]
      const result = computeNotionStatus(entries, true, shutdownTime, now)
      expect(result.streak).toBe(0)
    })
  })

  describe('shutdownAt', () => {
    it('today at shutdown time when nothing checked today', () => {
      const now = new Date('2026-03-18T15:00:00Z')
      const entries = [makeEntry('2026-03-17', true)]
      const result = computeNotionStatus(entries, true, shutdownTime, now)
      expect(result.shutdownAt.getUTCDate()).toBe(18)
      expect(result.shutdownAt.getUTCHours()).toBe(21)
    })

    it('tomorrow at shutdown time when both today and yesterday checked', () => {
      const now = new Date('2026-03-18T15:00:00Z')
      const entries = [
        makeEntry('2026-03-18', true),
        makeEntry('2026-03-17', true),
      ]
      const result = computeNotionStatus(entries, true, shutdownTime, now)
      expect(result.shutdownAt.getUTCDate()).toBe(19)
      expect(result.shutdownAt.getUTCHours()).toBe(21)
    })

    it('24h from lastEdited when only today checked (not yesterday)', () => {
      const now = new Date('2026-03-18T15:00:00Z')
      const lastEdited = '2026-03-18T10:00:00Z'
      const entries = [makeEntry('2026-03-18', true, lastEdited)]
      const result = computeNotionStatus(entries, true, shutdownTime, now)
      // Should be 24h after 10:00 = 2026-03-19T10:00:00Z
      expect(result.shutdownAt.toISOString()).toBe('2026-03-19T10:00:00.000Z')
    })

    it('falls back to tomorrow shutdown time when only today checked but no lastEdited', () => {
      const now = new Date('2026-03-18T15:00:00Z')
      const entries = [makeEntry('2026-03-18', true)]
      const result = computeNotionStatus(entries, true, shutdownTime, now)
      expect(result.shutdownAt.getUTCDate()).toBe(19)
      expect(result.shutdownAt.getUTCHours()).toBe(21)
    })
  })

  describe('timeUntilShutdown', () => {
    it('is positive before shutdown', () => {
      const now = new Date('2026-03-18T15:00:00Z')
      const entries = [makeEntry('2026-03-17', true)]
      const result = computeNotionStatus(entries, true, shutdownTime, now)
      // Shutdown at 21:00, now 15:00 → 6 hours
      expect(result.timeUntilShutdown).toBe(6 * 60 * 60 * 1000)
    })

    it('is negative after shutdown time', () => {
      const now = new Date('2026-03-18T22:00:00Z')
      const entries = [makeEntry('2026-03-17', true)]
      const result = computeNotionStatus(entries, true, shutdownTime, now)
      // Shutdown at 21:00, now 22:00 → -1 hour
      expect(result.timeUntilShutdown).toBe(-1 * 60 * 60 * 1000)
    })
  })

  describe('isLimited', () => {
    it('passes through isLimited flag', () => {
      const now = new Date('2026-03-18T15:00:00Z')
      expect(computeNotionStatus([], true, shutdownTime, now).isLimited).toBe(true)
      expect(computeNotionStatus([], false, shutdownTime, now).isLimited).toBe(false)
    })
  })

  describe('entries', () => {
    it('maps raw entries to NotionEntry format', () => {
      const now = new Date('2026-03-18T15:00:00Z')
      const entries = [
        makeEntry('2026-03-18', true, '2026-03-18T10:00:00Z'),
        makeEntry('2026-03-17', false),
      ]
      const result = computeNotionStatus(entries, true, shutdownTime, now)
      expect(result.entries).toHaveLength(2)
      expect(result.entries[0].date).toBe('2026-03-18')
      expect(result.entries[0].checked).toBe(true)
      expect(result.entries[1].date).toBe('2026-03-17')
      expect(result.entries[1].checked).toBe(false)
    })
  })
})

describe('parseNotionPages', () => {
  it('prefers title date mention over formula date', () => {
    const pages = [{
      last_edited_time: '2026-03-17T21:01:00Z',
      properties: {
        'Дата тренировки': {
          type: 'formula',
          formula: { type: 'date', date: { start: '2026-03-17T21:00:00.000+00:00' } },
        },
        'Сделал': { type: 'checkbox', checkbox: true },
        'Страница': {
          type: 'title',
          title: [
            { type: 'mention', plain_text: '2026-03-18', mention: { type: 'date', date: { start: '2026-03-18' } } },
            { type: 'text', plain_text: ' ', text: { content: ' ' } },
          ],
        },
      },
    }]
    const result = parseNotionPages(pages, 'Сделал')
    expect(result).toHaveLength(1)
    expect(result[0].checked).toBe(true)
    // Should use title date (March 18), not formula date (March 17 UTC)
    expect(result[0].date.getUTCDate()).toBe(18)
  })

  it('falls back to formula date when no title mention', () => {
    const pages = [{
      properties: {
        'Дата тренировки': {
          type: 'formula',
          formula: { type: 'date', date: { start: '2026-03-17' } },
        },
        'Сделал': {
          type: 'formula',
          formula: { type: 'boolean', boolean: false },
        },
      },
    }]
    const result = parseNotionPages(pages, 'Сделал')
    expect(result).toHaveLength(1)
    expect(result[0].checked).toBe(false)
  })

  it('falls back to date field', () => {
    const pages = [{
      properties: {
        'Дата тренировки': {
          type: 'date',
          date: { start: '2026-03-18' },
        },
        'Сделал': { type: 'checkbox', checkbox: true },
      },
    }]
    const result = parseNotionPages(pages, 'Сделал')
    expect(result).toHaveLength(1)
    expect(result[0].checked).toBe(true)
  })

  it('skips entries without dates', () => {
    const pages = [{
      properties: {
        'Дата тренировки': { type: 'date' },
        'Сделал': { type: 'checkbox', checkbox: true },
      },
    }]
    const result = parseNotionPages(pages, 'Сделал')
    expect(result).toHaveLength(0)
  })

  it('extracts rich_text notes', () => {
    const pages = [{
      properties: {
        'Дата тренировки': {
          type: 'date',
          date: { start: '2026-03-18' },
        },
        'Сделал': { type: 'checkbox', checkbox: true },
        'Комментарий': {
          type: 'rich_text',
          rich_text: [{ plain_text: 'Did workout' }],
        },
      },
    }]
    const result = parseNotionPages(pages, 'Сделал')
    expect(result[0].notes).toBe('Did workout')
  })
})
