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
- Agency business records are private to their creator until explicit team membership is implemented; this prevents arbitrary signups accessing internal data.
- Store private integration credentials in managed server secrets, not app_settings; the settings table is for non-secret configuration only.
- Placeholder pages are public and contain no business records; enforce authenticated routes and owner policies when adding real data screens.
- Load agency records through authenticated server functions and one shared query; this keeps financial and client screens on the same source of truth.
- Keep video classification and plan validation in a shared rules module; this prevents differing decisions across AI and forms.
- Channel analysis fetches current uploads server-side before AI evaluation; this avoids stale or invented channel context.
