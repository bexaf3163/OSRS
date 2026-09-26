// Одноцветные значки: stroke = currentColor, размер задаёт CSS.

import type { ReactNode } from 'react';
import type { StepType } from '../types';

type IconProps = { className?: string };

function Svg({ children, className }: IconProps & { children: ReactNode }) {
  return (
    <svg className={`icon ${className ?? ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

export const TYPE_LABEL: Record<StepType, string> = {
  quest: 'Квест',
  skill: 'Навык',
  gear: 'Снаряжение',
  prep: 'Подготовка',
};

export function TypeIcon({ type, className }: { type: StepType; className?: string }) {
  const paths: Record<StepType, ReactNode> = {
    // Свиток квеста
    quest: <><path d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9" /><path d="M7 4a2 2 0 0 0-2 2v1h4V6a2 2 0 0 0-2-2Z" /><path d="M9 7v11a2 2 0 1 1-4 0v-1h4" /><path d="M12 9h4M12 13h4" /></>,
    // Растущий навык
    skill: <><path d="M4 17l5-5 4 3 7-7" /><path d="M15 8h5v5" /></>,
    // Щит снаряжения
    gear: <><path d="M12 3l7 3v5.5c0 4.4-3 7.7-7 9.5-4-1.8-7-5.1-7-9.5V6l7-3Z" /></>,
    // Список подготовки
    prep: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4v2h6V4" /><path d="M9 11l1.5 1.5L13 10M9 16h6" /></>,
  };
  return (
    <span className={`type-icon type-${type} ${className ?? ''}`} title={TYPE_LABEL[type]}>
      <Svg>{paths[type]}</Svg>
      <span className="visually-hidden">{TYPE_LABEL[type]}</span>
    </span>
  );
}

export const IconPath = (p: IconProps) => <Svg {...p}><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7" /></Svg>;
export const IconSkills = (p: IconProps) => <Svg {...p}><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></Svg>;
export const IconGoals = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></Svg>;
export const IconQuests = (p: IconProps) => <Svg {...p}><path d="M6 21V4" /><path d="M6 4h11l-2.5 4L17 12H6" /></Svg>;
export const IconBook = (p: IconProps) => <Svg {...p}><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z" /></Svg>;
export const IconSettings = (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></Svg>;
export const IconSearch = (p: IconProps) => <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></Svg>;
export const IconChevron = (p: IconProps) => <Svg {...p}><path d="M9 6l6 6-6 6" /></Svg>;
export const IconBack = (p: IconProps) => <Svg {...p}><path d="M15 6l-6 6 6 6" /></Svg>;
export const IconCheck = (p: IconProps) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const IconExternal = (p: IconProps) => <Svg {...p}><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></Svg>;
export const IconClose = (p: IconProps) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const IconLock = (p: IconProps) => <Svg {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>;
