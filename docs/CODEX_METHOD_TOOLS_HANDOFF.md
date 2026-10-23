# Training tools and family uncertainty — unreleased 2.74.3

## Reproduced and repaired

The generic training-method converter discarded `type: tool` needs, so adopting a Mining/Woodcutting method could remove its tool from preparation and the plugin checklist. Watch names likewise omitted these needs. It also accepted a method from an unrelated skill. The converter now projects the existing axe/pickaxe family, canonical bronze item ID/shop metadata and existing alternatives, watches all tiers, and rejects a cross-skill pick. This uses the existing skill-use eligibility checks; it never requires the Attack level for wielding a carried tool.

Testing exposed a separate existing ownership defect: a confirmed-empty bronze row was returned as proof that the whole family was missing even when usable higher-tier rows had not been reported. Generic ownership now retains uncertainty for unread alternatives. Known carried stock still proves readiness; confirmed bank stock can satisfy a goal before unknown additional stock is considered. Insufficient observed stock never proves a shortage while other eligible stock remains unread. Manual fallback and legacy max-count protection remain intact.

The shared preparation allocator also spends confirmed bank stock as a lower bound before classifying any unresolved remainder. This preserves a valid withdrawal action even when the full family bank total is unread; a larger uncovered requirement remains UNKNOWN and cannot invent a purchase. An integrated engine-plan regression reproduced the missing action before this follow-up; it now passes.

## Verification

- All nine new method-projection/eligibility cases failed before converter repair. Three new core family-uncertainty cases failed before the ownership repair. They pass after repair; an additional manual-fallback regression passes.
- Ten focused suites pass: 136 tests. Full local run: 1,811 pass, six fail out of 1,817, confined to the previously independently reproduced sandbox loopback/temporary-rename restrictions. TypeScript/build and data validation pass with zero data errors/warnings. Final-code GitHub browser/Java/portable validation remains required.
- Browser smoke adds actual desktop-to-plugin plan checks at 390/1280px: unread higher tiers remain UNKNOWN without a purchase action; a complete absent-tool observation becomes MISSING; a carried usable Iron pickaxe becomes INVENTORY.
- First tool-block CI passed unit/Java checks but the new Node browser fixture failed before launch because its TypeScript import lacked the required `.ts` extension. The fixture import is corrected and independently loads under Node; final-tree CI must still pass. No gate or production behavior was weakened to address this harness defect.
- Existing known-empty fixtures now report every eligible tool tier as absent. The shared Java ownership fixture itself is unchanged: its four watched rows establish one physical Rune pickaxe, but cannot prove that an unwatched second tool is absent. Its partial-quantity assertion now uses a complete observation, while the original partial observation must remain UNKNOWN. The golden snapshot file is unchanged; its complete-observation builder now includes explicit tool alternatives.

Additional CI evidence: revision `50a00d2400c961acd2d4d32bfd937c9afc12d49d`, run `39997967420`, passed all 1,820 Vitest tests, build/data, Java and the actual isolated portable gate. All eight tool assertions at 390/1280px passed after the fixture selected its active step explicitly. The overall checks job then reached its ten-minute limit: Chromium dependencies had consumed most of that budget before the full browser run. The job limit is extended to 25 minutes; all gates remain enabled. This is not a completed final-tree browser pass.

## Scope and follow-up

This does not enable Mining/Woodcutting method following on S6-03 or complete the Cooking handover of S6-02. Those require coherent phase/supply/location changes, rather than adding a flag alone. No new tool database, rates, locations, mandatory purchases, route IDs or HUD panels were introduced. Full special-tool membership/quest/charge eligibility and remaining exact-ID consumers remain open.

The existing tool-level table was reused, not newly invented. The OSRS Wiki [Pickaxe](https://oldschool.runescape.wiki/w/Pickaxe) confirms the skill-use versus Attack-wield distinction. No live gameplay acceptance is claimed. The owner's queued armour/live-price/date request is preserved in OWNER_ARMOUR_PRICING_DATES_REQUEST.md and follows this repair.
