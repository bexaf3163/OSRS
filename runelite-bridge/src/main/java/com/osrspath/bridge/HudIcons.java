package com.osrspath.bridge;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.Path2D;

/** The HUD's small vector icons, shared by the classic card and the Ledger plaque. */
final class HudIcons
{
	private HudIcons()
	{
	}

	/** The card's small vector icons, all from the same strokes: no emoji, no font glyphs. (x, y) is the icon box's top left. */
	static void paint(Graphics2D g, HudModel.Icon icon, int x, int y, int s, Color c)
	{
		if (icon == HudModel.Icon.NONE || c == null)
		{
			return;
		}
		Graphics2D k = (Graphics2D) g.create();
		try
		{
			k.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
			k.setColor(c);
			k.setStroke(new BasicStroke(1.5f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
			float m = s / 2f;
			Path2D p = new Path2D.Float();
			switch (icon)
			{
				case QUEST:
				{
					// A small hexagon: the quest marker of the old card, smaller.
					for (int i = 0; i < 6; i++)
					{
						double a = Math.PI / 3 * i - Math.PI / 2;
						float px = (float) (x + m + Math.cos(a) * (m - 0.5));
						float py = (float) (y + m + Math.sin(a) * (m - 0.5));
						if (i == 0)
						{
							p.moveTo(px, py);
						}
						else
						{
							p.lineTo(px, py);
						}
					}
					p.closePath();
					k.draw(p);
					k.fillOval(Math.round(x + m - 1.5f), Math.round(y + m - 1.5f), 3, 3);
					return;
				}
				case TRAIN:
					// A target: what the training aims at.
					k.drawOval(x + 1, y + 1, s - 2, s - 2);
					k.fillOval(Math.round(x + m - 2), Math.round(y + m - 2), 4, 4);
					return;
				case PREPARE:
					// A bag with a handle.
					k.drawRoundRect(x + 1, y + 4, s - 2, s - 5, 3, 3);
					k.drawArc(Math.round(x + m - 3), y + 1, 6, 6, 0, 180);
					return;
				case GO:
					p.moveTo(x + 1.5f, y + m);
					p.lineTo(x + s - 2f, y + m);
					p.moveTo(x + s - 6f, y + m - 3.5f);
					p.lineTo(x + s - 2f, y + m);
					p.lineTo(x + s - 6f, y + m + 3.5f);
					k.draw(p);
					return;
				case NEXT:
					p.moveTo(x + m - 2f, y + m - 3.5f);
					p.lineTo(x + m + 1.5f, y + m);
					p.lineTo(x + m - 2f, y + m + 3.5f);
					k.draw(p);
					return;
				case BACK:
					p.moveTo(x + m + 2f, y + m - 3.5f);
					p.lineTo(x + m - 1.5f, y + m);
					p.lineTo(x + m + 2f, y + m + 3.5f);
					k.draw(p);
					return;
				case MORE:
					p.moveTo(x + m - 3.5f, y + m - 1.5f);
					p.lineTo(x + m, y + m + 2f);
					p.lineTo(x + m + 3.5f, y + m - 1.5f);
					k.draw(p);
					return;
				case CHECK:
					p.moveTo(x + 2f, y + m);
					p.lineTo(x + m - 1f, y + s - 3f);
					p.lineTo(x + s - 1.5f, y + 2.5f);
					k.draw(p);
					return;
				case MISSING:
					k.drawOval(x + 1, y + 1, s - 2, s - 2);
					k.drawLine(Math.round(x + m - 2.5f), Math.round(y + m - 2.5f), Math.round(x + m + 2.5f), Math.round(y + m + 2.5f));
					k.drawLine(Math.round(x + m + 2.5f), Math.round(y + m - 2.5f), Math.round(x + m - 2.5f), Math.round(y + m + 2.5f));
					return;
				case BANK:
					// A chest: the bank.
					k.drawRoundRect(x + 1, y + 3, s - 2, s - 5, 2, 2);
					k.drawLine(x + 1, Math.round(y + m), x + s - 1, Math.round(y + m));
					return;
				case UNKNOWN:
				{
					// A dashed circle: not checked.
					float r = m - 1;
					for (int i = 0; i < 8; i += 2)
					{
						k.drawArc(Math.round(x + m - r), Math.round(y + m - r), Math.round(2 * r), Math.round(2 * r), i * 45 + 10, 25);
					}
					return;
				}
				case WARN:
				case DANGER:
				{
					p.moveTo(x + m, y + 1f);
					p.lineTo(x + s - 0.5f, y + s - 1.5f);
					p.lineTo(x + 0.5f, y + s - 1.5f);
					p.closePath();
					if (icon == HudModel.Icon.DANGER)
					{
						k.fill(p);
						k.setColor(OsrsPathGuideOverlay.FILL);
					}
					else
					{
						k.draw(p);
					}
					k.fillRect(Math.round(x + m - 0.75f), y + 4, 2, Math.max(2, s - 9));
					k.fillRect(Math.round(x + m - 0.75f), y + s - 4, 2, 2);
					return;
				}
				case DOT:
					k.fillOval(Math.round(x + m - 1.5f), Math.round(y + m - 1.5f), 3, 3);
					return;
				default:
			}
		}
		finally
		{
			k.dispose();
		}
	}
}
