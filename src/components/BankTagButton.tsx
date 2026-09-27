// «🏷️ Скопировать Bank Tag для этапа»: строка импорта для плагина RuneLite Bank Tags — вкладка банка
// со всеми предметами этапа. Те же предметы плагин OSRS Path Bridge мягко подсвечивает в банке и без вкладки.

import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useFeatures } from '../lib/features';
import { generateStageBankTag, stageBankItemIds } from '../lib/bankTags';
import { copyText } from '../lib/clipboard';
import { plural } from '../lib/shopping';

export function BankTagButton({ stage, compact }: { stage: number; compact?: boolean }) {
  const { mode, steps } = useStore();
  const { bankTags } = useFeatures();
  const [copied, setCopied] = useState<'' | 'ok' | 'failed'>('');
  const { tag, count } = useMemo(
    () => ({ tag: generateStageBankTag(stage, mode, steps), count: stageBankItemIds(stage, mode, steps).length }),
    [stage, mode, steps],
  );
  if (!bankTags || !tag) return null;

  const copy = async () => setCopied((await copyText(tag)) ? 'ok' : 'failed');

  return (
    <div className={`banktag ${compact ? 'is-compact' : ''}`}>
      <button type="button" className="btn btn-sm" onClick={() => void copy()}
        title={`Строка импорта для плагина Bank Tags: ${count} ${plural(count, 'предмет', 'предмета', 'предметов')} этапа ${stage}`}>
        {copied === 'ok' ? '✓ Bank Tag скопирован' : compact ? '🏷️ Bank Tag этапа' : '🏷️ Скопировать Bank Tag для этапа'}
      </button>
      {!compact && <span className="muted small">{count} {plural(count, 'предмет', 'предмета', 'предметов')} этапа</span>}
      {copied && (
        <p className="small banktag-help" role="status">
          {copied === 'ok'
            ? <>В банке RuneLite нажми правой кнопкой на значок «+» слева вверху → <strong>Import tag tab</strong>. Появится вкладка <code className="code">osrspath_stage{stage}</code>.</>
            : 'Не удалось скопировать — буфер обмена недоступен.'}
        </p>
      )}
    </div>
  );
}
