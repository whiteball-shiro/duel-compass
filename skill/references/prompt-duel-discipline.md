# Live Duel Discipline

Use this prompt for any real duel against an opponent (human or AI), and for any
live route where the opponent can respond. It exists because the tool layer
alone does not make a decision agent play well: the observed failure mode is
"execute any legal action that is available", which produces clear losses even
with perfect tool usage.

## Turn Opening

- Before choosing any action, state the target end board for this turn and the
  prerequisite each part of it depends on.
- The target board is the board that *locks the opponent*, not the largest board
  reachable. Maximum material with no lock is usually worse than fewer bodies
  plus a floodgate or a position lock.
- If the prerequisite cannot be met, change the objective explicitly and say why.
  Do not spend cards merely because they are in hand.

## Means Serve The Goal

- Pick the means after the goal is fixed. Do not let an available action redefine
  the objective.
- A means is only usable if its *preconditions* hold. If a play only works when
  the opponent declines to respond, that is a bet, and it must be labeled as a
  bet before execution, not explained away afterwards.

## No Default Responses

- Every `SelectEffectYn`, `SelectYesNo`, chain window, and optional trigger is
  decided on its own merits by reading the `description`.
- Fixed defaults are wrong in both directions: "always decline", "always accept",
  and "take the last option" all discard real value. Destroy-replacement,
  summon-triggered, and once-per-turn optional effects are the common casualties.
- If the description is ambiguous, resolve it with card text and current state
  before answering.

## Label Hygiene

- Engine effect numbering is not card-face numbering. `(引擎效果#N)`,
  `(卡面效果②)`, and `未提供引擎效果标识` can all be missing, offset, or wrong.
  `description` and card text are the only reliable basis.
- Match actions by full prefix such as `发动效果[`, never by card name substring.
  A bare card name can hit `盖放魔陷[...]` and silently turn an activation into a
  set card.
- Never trust a cached `actionIndex`. Take it from the most recent
  `observeDuel({action:"actions"})` or the previous successful
  `executeAction.nextDecision.actions`; after any state change, re-observe.

## Response-Window Accounting

- Before reporting a play as safe, enumerate the opponent's visible responses:
  face-up negations, set cards, graveyard and banished effects, known hand
  traps, and any lock that makes the play illegal.
- When the play's value depends on the opponent not responding, say so in the
  same breath as the play. Do not present a gamble as a calculation.
- When the opponent is human, stop at every window that belongs to the opponent
  and wait. Never answer for the opponent.

## Win-Condition Switching

- Damage, locks, resource loops, and deck-out are all legitimate win conditions.
  Choose the one the current state pays for, and state the reason and the cost.
- When the opponent's life points make damage uneconomic, switching to resource
  and deck attrition is a strategy, not stalling. Track the resulting deck counts
  as evidence.
- Read the opponent's engine, not just their board: if their win path needs a
  specific material, category, or zone, removing that node is worth more than
  removing their biggest body.

## Reporting

- Report each action as: what is activated, why, and what it advances.
- Separate verified engine state from assumptions and bets.
- State the cost paid, including life points and cards handed to the opponent.

## Terminal And Export

- Prefer a natural terminal result. `saveArtifact({action:"replay",
  surrenderIfRunning:true})` truncates the recording at the surrender point and
  is only for an explicit request to stop a running duel.
- After export, report `terminalResult`, response count, and whether the export
  was surrendered, so the recording's completeness is auditable.

## Field Lessons

- A bounce/removal play aimed at a boss with a negation effect is still exposed
  to that negation. Confirm the target's response options before treating the
  removal as guaranteed.
- Losing a 3000 ATK body to an unanswered destroy-replacement is a single missed
  `SelectEffectYn`, not a strategic error; the fix is the decision discipline
  above, not a different line.
- Resource loops that shuffle cards back and draw (deck growth versus opponent
  deck shrink) convert a life-point deficit into a real threat over several
  turns. Measure them in deck counts.
