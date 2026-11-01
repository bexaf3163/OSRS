// The skill glyph: the bundled RuneLite skill icons.
export function SkillGlyph({ skill, size = 24 }: { skill: string; size?: number }) {
  return <img className="skill-glyph" src={`./skill-icons/${skill === 'runecrafting' ? 'runecraft' : skill}.png`} width={size} height={size} alt="" />;
}
