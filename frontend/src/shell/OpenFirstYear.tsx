import { useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { Button, EmptyState, toast } from '@qvanderlinden/ui'
import { messageOf } from '../errors'
import { formatDate } from '../format'
import { useFiscalYear } from './FiscalYearContext'

/** The main area while no fiscal year exists: one button opens the first one. */
export function OpenFirstYear() {
  const { next, openNext } = useFiscalYear()
  const [busy, setBusy] = useState(false)

  async function open() {
    setBusy(true)
    try {
      await openNext()
    } catch (e) {
      toast(messageOf(e), { tone: 'negative' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <EmptyState
      icon={CalendarPlus}
      title="Aucun exercice ouvert."
      action={
        next && (
          <Button variant="primary" iconLeft={CalendarPlus} disabled={busy} onClick={open}>
            {`Ouvrir l’exercice ${next.end_date.slice(0, 4)}`}
          </Button>
        )
      }
    >
      {next && `Du ${formatDate(next.start_date, 'full')} au ${formatDate(next.end_date, 'full')}.`}
    </EmptyState>
  )
}
