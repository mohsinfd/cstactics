# Public Readiness

This repo is safe to publish as a technical prototype after the following checks pass.

## Included

- Game logic and renderer source
- Public design notes and roadmap docs
- Map tooling scripts and static prototype assets

## Excluded

- Raw assistant handoff prompts
- Private scratch instructions
- Secrets, tokens, API keys, and local environment files

## Pre-Publish Checklist

- Run `npm run build`
- Run `npm run lint`
- Run `npm run map:validate`
- Scan for secrets with `rg -i "api[_-]?key|secret|password|token|client[_-]?secret|private[_-]?key"`
