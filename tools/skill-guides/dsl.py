"""The step constructor used by the content files."""


def s(skill, lo, hi, kind, title, text, place, lane, members, **extra):
    assert kind in ('QUEST', 'GATHER', 'CRAFT', 'COMBAT', 'MINIGAME'), kind
    assert lane in ('fast', 'afk', 'both'), lane
    step = {'skill': skill, 'lo': lo, 'hi': hi, 'type': kind, 'title': title, 'text': text, 'place': place, 'lane': lane, 'members': members}
    step.update({k: v for k, v in extra.items() if v is not None})
    return step
