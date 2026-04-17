# Repository Knowledge Rules

## Knowledge Base Location
- The Obsidian vault is located at `./brain/`.
- Treat `brain/` as the main knowledge base for this repository.

## Main Behavior
- Organize ideas, plans, prompts, decisions, architecture, tasks, and inferred repository knowledge into Markdown notes.
- Never delete knowledge notes unless explicitly instructed.
- Prefer merging and updating over replacing.
- Preserve original meaning when rewriting.
- Use Obsidian wiki links between related notes.
- Write all notes in English.
- Keep notes practical, concise, and structured.

## Classification Rules
- `brain/Inbox/` for raw findings that still need classification.
- `brain/Ideas/` for concepts, opportunities, product directions, and feature thoughts.
- `brain/Projects/` for project-level or module-level documentation.
- `brain/Decisions/` for explicit or strongly implied decisions.
- `brain/Plans/` for execution plans, phased work, and roadmaps.
- `brain/Prompts/` for reusable prompts, AI workflows, and instruction sets.
- `brain/Architecture/` for technical structure, system flows, routing, modules, and design patterns.
- `brain/Tasks/` for TODOs, FIXMEs, gaps, pending work, and follow-ups.
- `brain/Glossary/` for project-specific terminology and naming conventions.
- `brain/MOCs/` for navigation and grouping notes.
- `brain/Archive/` for old but still useful material.

## Note Quality
- Add a short summary at the top of each meaningful note.
- Include sources when the note is inferred from repository files.
- Prefer structured explanation over raw dumps.
- Mark uncertain conclusions as `Inferred`.
- Split oversized notes into focused notes.
- Merge duplicates when appropriate.

## Default Note Structure
Use this structure when appropriate:

# Title

## Summary
Short explanation of the note.

## Source
Files, folders, code areas, comments, or docs used.

## Details
Main structured explanation.

## Decisions
Only if applicable.

## Open Questions
Only if applicable.

## Next Steps
Only if applicable.

## Related Notes
Use Obsidian wiki links.

## Migration Priority
When scanning the repository, prioritize:
1. README and docs
2. planning Markdown files
3. prompts and workflow files
4. TODO / FIXME comments
5. architecture-revealing code structure
6. incomplete features and placeholders

## Editing Restrictions
- Do not modify application code unless needed for repository-safe note creation.
- Focus on building and maintaining the knowledge base in `brain/`.

## Project Context
- Main app: `hamburgueria-dispatch/` — Tauri 2 + React + TypeScript + Supabase desktop app
- Platform: Windows via WebView2
- Dev command: `npm run tauri dev` (never browser-only vite dev)
- Code language: English. Discussion: Portuguese (pt-BR).
- Always apply code changes to `C:\hamburgueria_SAAS\hamburgueria-dispatch` in addition to the worktree.
