<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep the shared agency shell and placeholder metadata in reusable agency components; each tab remains an independent route for later expansion.
- Agency records belong to a workspace owner; team logins (team_logins, created only by the owner) resolve to that owner via workspace_of() in RLS and an insert trigger, so arbitrary signups still see nothing.
- Store private integration credentials in managed server secrets, not app_settings; the settings table is for non-secret configuration only.
- Placeholder pages are public and contain no business records; enforce authenticated routes and owner policies when adding real data screens.
- Load agency records through authenticated server functions and one shared query; this keeps financial and client screens on the same source of truth.
- Keep video classification and plan validation in a shared rules module; this prevents differing decisions across AI and forms.
- Channel analysis fetches current uploads server-side before AI evaluation; this avoids stale or invented channel context.
- The public dashboard is a presentation-only shell until operational dashboard work is implemented; show unavailable metrics rather than fabricated financial totals.
- Derive finances in one shared pure module from client, payment and team records; historical charts must label collected recurring payments rather than invent historical contract values.
- Persist chat UI message parts in owner-scoped records and derive the active conversation from its page URL; this preserves reasoning and prevents histories crossing threads.
- Higgsfield image generation runs only in server code with key+secret from managed secrets; model/aspect/resolution constants live in src/lib/thumbnail-rules.ts so tests pin them.
- Client title/idea results persist one row per client+kind in client_suggestions, replaced only on explicit regenerate; avoids re-generating on every visit.
- Operational rules (capacity limit, lead pipeline totals, month grid, revenue this month) live in src/lib/ops-rules.ts; the dashboard reads shared agency + ops queries client-side because / is a public route.
- Integration status derives from managed secret presence plus last test/disconnect flags in app_settings; guides and the Discord stage parser live in src/lib/integration-rules.ts.

- Roles live in public.user_roles (one row per user, default CLIPPER via auth trigger; CLIENT rows carry client_id); RLS uses is_admin/has_role/my_client security-definer helpers, and sidebar visibility comes from src/lib/roles.ts so UI and tests share one list.
- Existing agency tables carry RESTRICTIVE admin-only policies; clients/analytics_snapshots allow CLIENT reads of their own client only. Field-level rules (Submission status/comment, Post status) are enforced by triggers, not UI.
- Engine is crayZmundo's own video processor in engine/, with Fly.io hosting its container; preserve its screens and src/lib/clip-engine.server.ts job driver, and route calls through engineClient in src/lib/engine.server.ts (ENGINE_URL in app_settings, ENGINE_API_KEY secret) without vendor fallbacks so processing stays within crayZmundo.
- Clip job flow lives in src/lib/clip-engine.server.ts + clip.functions.ts with shared form/range rules in src/lib/clip-rules.ts; clip_jobs DB enums are uppercase (engine NATIVE, framing AUTO/BOTH/CENTER, edit_level clips/captions/cropped/full) and the UI maps its lowercase form values on submit.
- Sign-up is disabled; users are created only by admins via createTeamLogin on the Team tab.
- Library upload limits, resolution badges, upscale note and 30-day trash purge live in src/lib/library-rules.ts; Engine-deleting logic is shared in src/lib/library.server.ts so the UI and nightly purge behave the same.
- Engine imports use a durable SQLite queue and a single worker per mounted volume; startup recovers interrupted claims, and shared media wrappers bound decoder, encoder, filter and transcription threads to keep HTTP responsive.
