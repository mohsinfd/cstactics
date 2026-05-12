# XCOM 2 Tactical UX Notes for CS2 Tactics

## What to Borrow Now

- Selection should create a clear command state: the active unit, reachable movement bands, path preview, AP cost, and destination cover are all visible before the player commits.
- Movement bands should preserve intent. A short move keeps a follow-up action available; a dash spends the turn. In CS2 Tactics this maps cleanly to `1 AP move` and `2 AP full commit`.
- Destination feedback should be richer than coordinates. The player should know the callout, AP cost, and cover quality while hovering.
- Unit flow should avoid dead clicks. When a unit has no AP left, selection should advance to the next available teammate.
- The selected-unit panel should grow toward an XCOM-style unit flag: HP, AP, cover, weapon, status, and available actions in one compact read.

## What to Adapt Later

- Add directional cover instead of a single cover value. XCOM communicates whether cover protects from a threat direction; for CS2 this should become angle-based exposure from known enemy positions.
- Add danger overlays: watched lanes, likely enemy contact, grenade danger, smoke coverage, and sound-breaking/noisy movement.
- Add action previews for shooting: hit chance, damage range, cover penalty, range modifier, and whether the shot consumes the remaining AP.
- Add waypoint movement once pathing matters tactically, especially for avoiding watched lanes or noisy surfaces.
- In a future 2.5D camera, keep the same decision layer: cinematic height is presentation, but the player still needs top-down readable AP/cover truth.
