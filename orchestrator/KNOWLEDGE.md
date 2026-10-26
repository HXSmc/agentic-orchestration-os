# Knowledge index (every hub, builder, reviewer, approver and GLM spoke)

What to read before which kind of work. Read only the rows that match your task. Paths with `*`
are version globs: resolve them with `ls` (same file on the Mac and the mini PC).
Plugin skills live under `P=~/.claude/plugins/cache`. A GLM spoke has no Skill tool: it reads the
`SKILL.md` by path and follows it. A Claude agent may use the Skill tool by name instead.

The spec's `## Knowledge` section names the exact files for that task. This index is the menu
the hub picks from when writing that section.

## UI / frontend (build, redesign, review)
| Read | When |
|---|---|
| `~/.claude/design-refs/REFERENCES.md` (+ the .jpg refs it names) | landing page, hero, brand surface. Inspiration only, never copy |
| `~/.claude/design-refs/UI-PATTERNS.md` | any component, layout or page |
| `~/.claude/design-refs/UX-LAWS.md` | forms, pricing, nav, onboarding, settings, checkout. Meet every **Check** line |
| `~/.claude/design-refs/ANTI-SLOP.md`, `LESSONS.md` | every UI task |
| `~/.claude/design-refs/BRAND-SITE-REFS.md`, `WEB-ASSET-SPECS.md` | brand sites, images, OG/favicons |
| `~/.claude/design-refs/INTERNAL-NOTEKIT.md` | NoteKit work only |
| `~/.claude/skills/hallmark/SKILL.md` | new pages/sites that must look designed, not generated |
| `~/.claude/skills/impeccable/SKILL.md` | audit, polish, harden, critique an existing UI |
| `$P/taste-skill/taste-skill/*/skills/taste-skill/SKILL.md` | design taste baseline |
| `$P/taste-skill/taste-skill/*/skills/redesign-skill/SKILL.md` | redesigning an existing project |
| `$P/ui-ux-pro-max-skill/ui-ux-pro-max/*/.claude/skills/ui-ux-pro-max/SKILL.md` | design system, palettes, type pairing |
| `~/.claude/skills/make-interfaces-feel-better/SKILL.md`, `motion-ui/SKILL.md` | polish, motion |
| `~/.claude/skills/frontend-patterns/`, `react-patterns/`, `react-performance/` | React/Next code |

**Machine check for every UI change (builder before handing off, ui reviewer again):**
`node ~/.claude/skills/hallmark/scripts/sloplint.mjs <file-or-dir> --render`
(mini PC: prefix `CHROME_PATH=$HOME/.local/bin/hallmark-chrome` if unset; no browser -> static
tier, say so). Every `FAIL` is fixed. Every `REFLEX` is fixed or given a reason.
Visual check of a screenshot: `glm-vision "<question>" shot.png` before spending Claude on it.

## Writing for humans (copy, emails, docs, posts, reports)
| Read | When |
|---|---|
| `~/.claude/skills/anti-slop-writing/SKILL.md` | any prose a human reads |
| `$P/marketingskills/marketing-skills/*/skills/<name>/SKILL.md` | copywriting, cold-email, pricing, seo-audit, launch, cro, onboarding, emails, ... (one per topic) |
| `~/.claude/skills/content-principles/SKILL.md` | short-form video, hooks, social posts |
| `~/Desktop/personal/buyer-panel/panel-auto.md` | before cold outreach copy or lead-enrichment spend |

## Code
| Read | When |
|---|---|
| `~/.claude/skills/coding-standards/SKILL.md` | every code task |
| `~/.claude/skills/<lang>-patterns/`, `<lang>-testing/` | python, golang, kotlin, react, fastapi, postgres, prisma |
| `~/.claude/skills/backend-patterns/`, `api-design/`, `error-handling/`, `database-migrations/` | backend, APIs, schema changes |
| `~/.claude/skills/e2e-testing/`, `ai-regression-testing/` | tests |
| `~/.claude/skills/security-review/SKILL.md` | auth, user input, secrets, payments, PII (security lens always) |
| `~/.claude/skills/healthcare-phi-compliance/SKILL.md` | health data (Taweed/Nuzum) |
| repo `.claude/skills/verify-*/SKILL.md` | the repo's own live verification recipe, if present |
| `~/.claude/skills/thermo-nuclear-code-quality-review/SKILL.md` | final quality pass on big diffs |

## Legal, KSA, business
| Read | When |
|---|---|
| `~/Desktop/ObsidianVault/Reference/KSA Law/KSA Law Pack.md` + the digest note | ANY KSA legal/compliance/T&C question. Cite المادة numbers, state version_status |
| `~/.claude/skills/fundraise-prep/`, `pitch-deck/` | fundraising |

## Owner context
| Read | When |
|---|---|
| `~/Desktop/ObsidianVault/Brain/Memory/MEMORY.md` | the task touches past decisions, tools or traps |
| `~/Desktop/ObsidianVault/Projects/<project>.md` | working inside a known project |
| `~/.claude/orchestrator/state/DECISIONS.md` | before changing orchestrator doctrine |

Never read `~/Desktop/ObsidianVault/Secrets/` unless the spec explicitly says so.
