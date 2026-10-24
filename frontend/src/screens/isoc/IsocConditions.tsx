import { Badge, Card, Checkbox, toast } from '@qvanderlinden/ui'
import { api } from '../../api/client'
import type { IsocRead } from '../../api/types'
import { messageOf } from '../../errors'
import { eur, formatRate } from '../../format'
import { useSavedPick } from '../../pieces/useSavedField'
import { conditionFields, conditionLabels, type Condition } from './isocView'

const CONDITIONS: Condition[] = ['small_company', 'minimum_pay', 'shares_owned']

/** One condition, ticked when met; saved on the fiscal year at once. */
function ConditionBox({ condition, met, yearId, onSaved }: { condition: Condition; met: boolean; yearId: number; onSaved(): Promise<void> }) {
  const [checked, pick] = useSavedPick(met, async (value: boolean) => {
    try {
      await api.patch(`/fiscal-years/${yearId}`, { [conditionFields[condition]]: value })
      await onSaved()
      return true
    } catch (e) {
      toast(messageOf(e), { tone: 'negative' })
      return false
    }
  })
  return <Checkbox label={conditionLabels[condition]} checked={checked} onCheckedChange={(v) => pick(v === true)} />
}

/**
 * "Taux réduit" (`Isoc` artboard): the three conditions of the reduced rate, ticked when met,
 * stored on the fiscal year; the ISOC read reloads after each.
 */
export function IsocConditions({ isoc, yearId, onSaved }: { isoc: IsocRead; yearId: number; onSaved(): Promise<void> }) {
  return (
    <Card
      title="Taux réduit"
      subtitle={`${formatRate(isoc.reduced_rate)} sur les premiers ${eur(isoc.reduced_ceiling)} de base, si les trois conditions sont remplies`}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          {CONDITIONS.map((c) => (
            <ConditionBox key={c} condition={c} met={isoc.conditions[c]} yearId={yearId} onSaved={onSaved} />
          ))}
        </div>
        <div className="flex flex-col items-start gap-1.5 border-t border-line-hairline pt-3">
          {isoc.reduced ? (
            <>
              <Badge tone="positive">taux réduit applicable</Badge>
              <span className="text-xs text-fg-muted">Les trois conditions sont remplies.</span>
            </>
          ) : (
            <>
              <Badge tone="warning">taux normal de {formatRate(isoc.normal_rate)}</Badge>
              <span className="text-xs text-fg-muted">
                Une condition manque : toute la base est taxée à {formatRate(isoc.normal_rate)}.
              </span>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}
