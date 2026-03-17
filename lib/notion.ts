export interface NotionEntry {
  date: string // YYYY-MM-DD
  checked: boolean
  notes?: string // rich_text content if any
  lastEdited?: string // ISO string
}

export interface NotionStatus {
  checkedToday: boolean
  checkedYesterday: boolean
  shutdownAt: Date
  timeUntilShutdown: number // ms, can be negative if past
  streak: number
  canStart: boolean
  isLimited: boolean
  entries: NotionEntry[]
}

interface NotionPage {
  last_edited_time?: string
  properties: Record<
    string,
    {
      type: string
      checkbox?: boolean
      formula?: {
        type: string
        date?: { start: string } | null
        string?: string
        boolean?: boolean
        number?: number
      }
      date?: { start: string } | null
      rich_text?: Array<{ plain_text?: string; text?: { content: string } }>
    }
  >
}

function getShutdownDate(date: Date, shutdownTime: string): Date {
  const [hours, minutes] = shutdownTime.split(':').map(Number)
  const d = new Date(date)
  d.setUTCHours(hours, minutes, 0, 0)
  return d
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function extractRichText(props: NotionPage['properties']): string | undefined {
  for (const key of Object.keys(props)) {
    const field = props[key]
    if (field.type === 'rich_text' && field.rich_text?.length) {
      return field.rich_text.map((r) => r.plain_text ?? r.text?.content ?? '').join('')
    }
  }
  return undefined
}

export async function getNotionStatus(serverIp: string): Promise<NotionStatus | null> {
  const token = process.env.NOTION_INTEGRATION_TOKEN
  const databaseId = process.env.NOTION_DATASOURCE_ID
  const boolColumn = process.env.NOTION_BOOL_COLUMN_NAME || 'Сделал'
  const shutdownTime = process.env.SERVER_SHUTDOWN_TIME || '21:00'
  const limitedIps = (process.env.SERVER_IPS_TO_NOTION_LIMITS || '')
    .split(',')
    .map((ip) => ip.trim())
    .filter(Boolean)

  if (!token || !databaseId) return null

  const isLimited = limitedIps.includes(serverIp)

  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sorts: [{ property: 'Дата тренировки', direction: 'descending' }],
        page_size: 60,
      }),
      cache: 'no-store',
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      console.error(`Notion API error (${response.status}): ${errText}`)
      return null
    }

    const data = await response.json()
    const pages: NotionPage[] = data.results || []

    const now = new Date()
    const today = new Date(now)
    const yesterday = new Date(now)
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)

    interface Entry {
      date: Date
      checked: boolean
      notes?: string
      lastEdited?: string
    }

    const rawEntries: Entry[] = []

    for (const page of pages) {
      const dateField = page.properties['Дата тренировки']
      const checkedField = page.properties[boolColumn]

      let date: Date | null = null

      if (dateField?.formula?.date?.start) {
        date = new Date(dateField.formula.date.start)
      } else if (dateField?.date?.start) {
        date = new Date(dateField.date.start)
      }

      if (!date) continue

      let checked = false
      if (checkedField?.checkbox !== undefined) {
        checked = checkedField.checkbox
      } else if (checkedField?.formula?.boolean !== undefined) {
        checked = checkedField.formula.boolean
      }

      rawEntries.push({
        date,
        checked,
        notes: extractRichText(page.properties),
        lastEdited: page.last_edited_time,
      })
    }

    const todayEntry = rawEntries.find((e) => isSameDay(e.date, today))
    const yesterdayEntry = rawEntries.find((e) => isSameDay(e.date, yesterday))

    const checkedToday = todayEntry?.checked ?? false
    const checkedYesterday = yesterdayEntry?.checked ?? false

    // Calculate streak
    let streak = 0
    const sortedChecked = rawEntries
      .filter((e) => e.checked)
      .sort((a, b) => b.date.getTime() - a.date.getTime())

    if (sortedChecked.length > 0) {
      const startDate = checkedToday ? today : checkedYesterday ? yesterday : null
      if (startDate) {
        streak = 1
        let prevDate = new Date(startDate)
        for (let i = 1; i < sortedChecked.length; i++) {
          const expected = new Date(prevDate)
          expected.setUTCDate(expected.getUTCDate() - 1)
          if (isSameDay(sortedChecked[i].date, expected)) {
            streak++
            prevDate = sortedChecked[i].date
          } else if (!isSameDay(sortedChecked[i].date, prevDate)) {
            break
          }
        }
      }
    }

    // Calculate shutdown time
    let shutdownAt: Date
    const tomorrow = new Date(today)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

    if (checkedToday && !checkedYesterday) {
      // Only today checked: 24h from last edit of today's entry
      if (todayEntry?.lastEdited) {
        shutdownAt = new Date(new Date(todayEntry.lastEdited).getTime() + 24 * 60 * 60 * 1000)
      } else {
        shutdownAt = getShutdownDate(tomorrow, shutdownTime)
      }
    } else if (checkedToday) {
      // Today and yesterday checked: tomorrow at shutdown time
      shutdownAt = getShutdownDate(tomorrow, shutdownTime)
    } else {
      // Not checked today: today at shutdown time
      shutdownAt = getShutdownDate(today, shutdownTime)
    }

    const timeUntilShutdown = shutdownAt.getTime() - now.getTime()
    const canStart = checkedToday || checkedYesterday

    // Build entries for calendar
    const entries: NotionEntry[] = rawEntries.map((e) => ({
      date: toDateKey(e.date),
      checked: e.checked,
      notes: e.notes,
      lastEdited: e.lastEdited,
    }))

    return {
      checkedToday,
      checkedYesterday,
      shutdownAt,
      timeUntilShutdown,
      streak,
      canStart,
      isLimited,
      entries,
    }
  } catch (err) {
    console.error('Notion fetch error:', err)
    return null
  }
}
