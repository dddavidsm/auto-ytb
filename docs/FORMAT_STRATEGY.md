# Format Strategy

`auto-ytb` must never assume one YouTube format is universally optimal.

## Decision level

Format is selected per opportunity, not only per channel.

Supported strategy outputs:

- `LONG_HORIZONTAL` — native 16:9, typically deeper narrative/search/TV/sponsor use cases.
- `SHORT_VERTICAL` — native 9:16, typically high-velocity, hook-first, mobile/repeatable use cases.
- `HYBRID` — both formats are viable; the scheduler chooses a concrete primary piece within current slots/budget and can create cross-format opportunities after performance evidence.

## Native production

Long-form:
- 1920x1080 / 16:9
- channel target duration with bounded learning
- three thumbnail hypotheses and custom thumbnail upload
- long-form retention/economics learning

Shorts:
- 1080x1920 / 9:16
- default target 45s, hard production range 20–180s
- native vertical visual prompts and faster scene cadence
- no custom-thumbnail requirement in QA or automatic thumbnail upload
- Shorts retention/economics learning separated from long-form

## Format scoring signals

The Format Strategy Engine considers narrative depth, snackability, trend velocity, search depth, repeatability, monetization depth, sponsor fit, short-hook strength, long retention potential, mobile/TV fit, episodic potential, production complexity, kid-audience fit and compliance risks.

Explicit `signals.formatSignals` from intelligence override fallback inference when present.

## Format-specific learning

Learning must be separated by `publications.content_format`. A successful Short must never teach long-form that a 45-second duration is optimal, and long-form behavior must not distort Shorts retention expectations.

The database stores format performance snapshots for longitudinal comparison of:

- views
- average viewed percentage
- average view duration
- share rate
- subscribers per thousand views
- revenue
- production cost
- ROI

## Cross-format promotion

Analytics may create a new opportunity in the opposite format. The new opportunity returns to the normal scheduler, budget, risk and QA gates; Analytics never bypasses production governance.

Default Short → long promotion:
- at least 5,000 views
- at least 70% average viewed
- plus share rate >= 0.5% or >= 3 subscribers / 1,000 views

Default long → Short promotion:
- at least 3,000 views
- at least 50% average viewed
- plus strong hook or share rate >= 0.5%

Environment overrides:

- `SHORT_TO_LONG_MIN_VIEWS`
- `SHORT_TO_LONG_MIN_AVP`
- `LONG_TO_SHORT_MIN_VIEWS`
- `LONG_TO_SHORT_MIN_AVP`
- `AUTO_SHORT_RESERVED_COST_USD`

## Kids content

High kid-audience fit is not treated as a shortcut to Shorts. Made-for-kids compliance, monetization and channel behavior must be evaluated as a distinct business/compliance model. Format selection cannot bypass policy, originality or monetization gates.

## Governance

- format choice is auditable in opportunity/job/production/publication metadata;
- only native aspect-ratio renders pass format QA;
- hard risk and factual gates remain independent of format score;
- hybrid production cannot silently exceed daily slots or budget;
- all generated uploads remain private until the configured review gate is satisfied.
