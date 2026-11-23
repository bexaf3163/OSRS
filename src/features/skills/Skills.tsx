// The list of skills: what to train now in each, and the way into each skill's training guide (its method, place and leveling roadmap).
import { useMemo } from 'react';
import { levelById, membersSkills, skills } from '../../data';
import { useStore } from '../../state/store';
import { usePlannerSkillGoals } from '../../state/decision';
import { levelOf } from '../../domain/persistence/progress';
import type { Skill } from '../../types';
import { SkillGlyph } from '../../ui/SectionShell';
import { useBridge } from '../../state/bridge';
import { useTracked } from '../../state/hooks/useTracked';
import { SkillDetailPage } from './SkillDetail';
import { Eyebrow, Page } from '../../ledger';
import { f2pAdviceFor, f2pAdviceLabel, F2P_PRIORITY_LABEL } from '../../domain/training/f2pSkillAdvice';
import { hrefTo } from '../../domain/pages/pages';
import { usePlayerState } from '../../state/playerStateContext';
import { usePriceView } from '../../state/hooks/usePriceView';
import { useTradeRestriction } from '../../state/hooks/useTradeRestriction';
import { membersCheckpoints } from '../../domain/training/trackedTraining';
import { CheckpointList } from './CheckpointList';
import { questLevelNeeds, questNeedLabel, SKILL_TAB_ORDER } from '../../domain/planning/questLevelNeeds';

/** Free-to-play: the guide's order, Hitpoints with Melee. Members: every skill, in the in-game skill tab's order. */
const f2pGrid = skills.flatMap((s) => [...s.levelSkills, ...(s.id === 'ME' ? ['hitpoints'] : [])].map((id) => [id, s] as [string, Skill]));
const membersGrid = [...f2pGrid, ...membersSkills.flatMap((m) => m.levelSkills.map((id) => [id, m] as [string, Skill]))]
  .sort(([a], [b]) => SKILL_TAB_ORDER.indexOf(a) - SKILL_TAB_ORDER.indexOf(b));

/** The Skills spread: the character sheet on the left, the chosen skill (or the followed one) on the right. */
export function SkillsPage({ param, selectedSkill, goal }: { param?: string; selectedSkill?: string; goal?: number }) {
  const { mode, progress } = useStore();
  const needs = useMemo(() => (mode === 'members' ? questLevelNeeds(progress, true) : null), [mode, progress]);
  const plannerGoals = usePlannerSkillGoals();
  const tracked = useTracked();
  const trackedHome = tracked ? [...skills, ...membersSkills].find((s) => s.levelSkills.includes(tracked.skill)) : undefined;
  const shown = param ?? trackedHome?.id;
  return (
    <>
    <Page side="l" basis={560} className="skills-index" label="Skills">
    <div className="page la-scroll">
      <Eyebrow>CHARACTER SHEET</Eyebrow>
      <header className="page-head">
        <h1>Skills</h1>
        <p className="muted">Choose a skill for a recommended method. {plannerGoals.size ? `Goals follow the planner: ${[...plannerGoals.values()][0].why}.` : 'The planner needs no training now; each skill trains up to where its training method changes.'}</p>
      </header>
      {mode === 'f2p' && <p className="small muted f2p-priority-key">★ Good F2P value · ◇ Optional · ↓ Prefer members. Suggested checkpoints, not caps.</p>}

      <div className="skill-grid skill-grid-compact">
        {(mode === 'members' ? membersGrid : f2pGrid).map(([id, s]) => <SkillCard key={id} skill={s} id={id} need={needs?.get(id)} />)}
      </div>
      {needs && <MembersQuestSkills needs={needs} />}
    </div>
    </Page>
    <Page side="r" className="skills-detail" label="Skill">
      <div className="la-scroll">
        {shown ? (
          <SkillDetailPage key={`${shown}:${selectedSkill ?? ''}:${goal ?? ''}`} id={shown} selectedSkill={param ? selectedSkill : tracked?.skill} requestedGoal={goal} />
        ) : (
          <div className="page">
            <Eyebrow>TRAINING</Eyebrow>
            <h2 className="la-t">Choose a skill</h2>
            <p className="muted">Select a skill to see its current method, required kit, destination and next training stage.</p>
            <p className="small muted">An active training plan opens here automatically. XP tables and calculations remain in Calculator and Reference.</p>
          </div>
        )}
      </div>
    </Page>
    </>
  );
}

/** Members: the levels the open quests still need, the skills that earn coins first (the shared checkpoint list and its coin ledger). */
function MembersQuestSkills({ needs }: { needs: ReadonlyMap<string, number> }) {
  const { state } = usePlayerState();
  const prices = usePriceView(true);
  const trade = useTradeRestriction();
  const rows = useMemo(() => membersCheckpoints(state, needs, { prices, restriction: trade.state }), [state, needs, prices, trade.state]);
  if (!rows.length) return null;
  return (
    <section className="section" aria-label="Quest skill levels">
      <h3>Quest skill levels: earn first, then spend</h3>
      <CheckpointList rows={rows} label="Members quest skill levels" />
    </section>
  );
}

/** One skill per tile; recommendations and manual level editing live on its detail page. */
function SkillCard({ skill, id, need }: { skill: Skill; id: string; need?: number }) {
  const { progress, mode } = useStore();
  const { state, stats } = useBridge();
  const tracked = useTracked();
  const live = state === 'online' && stats?.[id as keyof typeof stats] != null;
  const name = levelById.get(id)?.name ?? (id === 'hitpoints' ? 'Hitpoints' : skill.name);
  const advice = mode === 'f2p' ? f2pAdviceFor(id) : null;
  // Use the same admitted profile level as the tile; raw stats may belong to an unresolved character.
  const knownLevel = progress.levels?.[id];
  const isTracked = tracked?.skill === id;
  // Members: every tile names the level the open quests still need, in the free-to-play tile's place.
  const level = levelOf(progress, id);
  const questLine = mode === 'members' ? questNeedLabel(need, level) : null;
  const content = <>
    <SkillGlyph skill={id} size={28} />
    <span className="skill-name">{name}</span>
    <span className="muted">{levelOf(progress, id)}{isTracked && <span className="visually-hidden">, followed in the game</span>}</span>
    {advice && <span className={`f2p-skill-badge is-${advice.priority}`} title={`${F2P_PRIORITY_LABEL[advice.priority]}. ${advice.reason}`}>
      {f2pAdviceLabel(advice, knownLevel)}
    </span>}
    {questLine && <span className={`skill-badge${need !== undefined && level < need ? ' is-good' : ''}`}>{questLine}</span>}
  </>;
  return (
    <article className={`skill-card card skill-tile ${isTracked ? 'is-tracked' : ''}`}>
      {id === 'hitpoints' ? <div className="skill-card-link">{content}<span className="visually-hidden">Gained in combat; no separate F2P target.</span></div>
        : <a className="skill-card-link" href={hrefTo.skills(skill.id, id)} aria-label={`${name}, level ${levelOf(progress, id)}${live ? ', live' : ', saved'}${advice ? `, ${F2P_PRIORITY_LABEL[advice.priority]}, ${f2pAdviceLabel(advice, knownLevel)}` : ''}${questLine ? `, ${questLine}` : ''}`}>
          {content}
        </a>}
    </article>
  );
}
