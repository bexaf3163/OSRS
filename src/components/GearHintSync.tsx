// Совет по снаряжению — в игру (POST /gear-hint). Строка в HUD («⚡ Сильнее: Steel scimitar у Zeke…») и подсветка
// в сумке и банке — только пока в игре показан невыполненный шаг с боем и совет на нём не пропущен. Какие предметы
// спросить у банка — всегда, пока есть связь: по ним страница «Снаряжение» узнаёт, что лежит в банке.
// Шлётся при изменении и после переподключения; выключили функцию — снимается. Ничего не рисует.

import { useEffect, useRef } from 'react';
import { useBridge } from '../bridge';
import { useStore } from '../store';
import { useFeatures } from '../lib/features';
import { isClosed } from '../lib/next-step';
import { useGearAdvice } from '../lib/gearAdvice';
import { hudHint, watchNames } from '../services/gearAdvisor';
import { setGearHint, type GearHintPayload } from '../services/runeliteBridge';

export function GearHintSync() {
  const { state, activeStepId } = useBridge();
  const { steps, progress } = useStore();
  const { upgradeRouter } = useFeatures();
  const step = activeStepId ? steps.find((s) => s.id === activeStepId) ?? null : null;
  const { advice, input } = useGearAdvice(step);
  /** Что уже в плагине при этом подключении; null — ничего. */
  const sent = useRef<string | null>(null);
  /** Плагин старой версии не знает /gear-hint — до переподключения не спрашиваем. */
  const old = useRef(false);

  const fighting = Boolean(step?.foes?.length) && !isClosed(progress, step!.id) && !(progress.upgradeDismissedForSteps ?? []).includes(step!.id);
  const top = advice.actions[0];
  const payload: GearHintPayload | null = upgradeRouter
    ? {
      ...(fighting && top ? { text: hudHint(top) } : {}),
      watchItems: watchNames(input),
      highlightItems: fighting ? advice.actions.filter((a) => a.how === 'wear').map((a) => a.item.name) : [],
    }
    : null;
  const key = JSON.stringify(payload);

  useEffect(() => {
    if (state !== 'online') {
      // RuneLite закрыли или перезапустили — совет там пропал, после подключения отправим заново.
      sent.current = null;
      old.current = false;
      return;
    }
    if (old.current || key === sent.current || (payload === null && sent.current === null)) return;
    // Уровни и сумка меняются очередью событий — отправляем, когда всё улеглось.
    const timer = setTimeout(() => {
      sent.current = key;
      void setGearHint(payload).then((r) => {
        if (r === 'old') old.current = true;
        else if (r === 'offline') sent.current = null;
      });
    }, 300);
    return () => clearTimeout(timer);
    // payload пересчитывается каждую отрисовку — следим за его содержимым через key.
  }, [state, key]);

  return null;
}
