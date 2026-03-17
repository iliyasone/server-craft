export interface NotionStatus {
  checkedToday: boolean
  checkedYesterday: boolean
  shutdownAt: Date
  timeUntilShutdown: number // ms, can be negative if past
  streak: number
  canStart: boolean
  isLimited: boolean
}

interface NotionPage {
  properties: Record<string, {
    type: string
    checkbox?: boolean
    formula?: { type: string; date?: { start: string } | null; string?: string; boolean?: boolean; number?: number }
    date?: { start: string } | null
  }>
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
        page_size: 30,
      }),
      cache: 'no-store',
    })

    if (!response.ok) return null

    const data = await response.json()
    const pages: NotionPage[] = data.results || []

    const now = new Date()
    const today = new Date(now)
    const yesterday = new Date(now)
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)

    // Parse entries: find date and checked status
    interface Entry { date: Date; checked: boolean }
    const entries: Entry[] = []

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

      entries.push({ date, checked })
    }

    const todayEntry = entries.find((e) => isSameDay(e.date, today))
    const yesterdayEntry = entries.find((e) => isSameDay(e.date, yesterday))

    const checkedToday = todayEntry?.checked ?? false
    const checkedYesterday = yesterdayEntry?.checked ?? false

    // Calculate streak (consecutive checked days ending today or yesterday)
    let streak = 0
    const sortedEntries = entries
      .filter((e) => e.checked)
      .sort((a, b) => b.date.getTime() - a.date.getTime())

    if (sortedEntries.length > 0) {
      const startDate = checkedToday ? today : (checkedYesterday ? yesterday : null)
      if (startDate) {
        streak = 1
        let prevDate = new Date(startDate)
        for (let i = 1; i < sortedEntries.length; i++) {
          const expected = new Date(prevDate)
          expected.setUTCDate(expected.getUTCDate() - 1)
          if (isSameDay(sortedEntries[i].date, expected)) {
            streak++
            prevDate = sortedEntries[i].date
          } else if (!isSameDay(sortedEntries[i].date, prevDate)) {
            break
          }
        }
      }
    }

    // Calculate shutdown time
    let shutdownAt: Date
    if (checkedToday) {
      // Tomorrow at shutdown time
      const tomorrow = new Date(today)
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
      shutdownAt = getShutdownDate(tomorrow, shutdownTime)
    } else {
      // Today at shutdown time
      shutdownAt = getShutdownDate(today, shutdownTime)
    }

    const timeUntilShutdown = shutdownAt.getTime() - now.getTime()

    const canStart = checkedToday || checkedYesterday

    return {
      checkedToday,
      checkedYesterday,
      shutdownAt,
      timeUntilShutdown,
      streak,
      canStart,
      isLimited,
    }
  } catch (err) {
    console.error('Notion fetch error:', err)
    return null
  }
}
