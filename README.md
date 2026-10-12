# Liquidglass Hq

Build a full-stack internal agency dashboard called "Agency Admin" for a content/clipping agency that builds in-house content teams for personal-brand entrepreneurs. Use Base44's built-in database, authentication, and hosting. This is a web app — do not try to make a desktop app.




DESIGN SYSTEM — make every screen feel like it was designed by Apple (2024–2025 visionOS / "liquid glass" era). Someone should open this and think "this looks expensive."

- Dark mode by default, with a working light-mode toggle.

- Typography: system font stack -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif. Headings semibold (600) with tight letter-spacing (-0.02em). Body 400. Labels 500. Page titles 28–34px, section headers 20–22px, card titles 17px, body 15px, captions 13px.

- Dark palette: bg #000000, elevated surfaces #1c1c1e, secondary #2c2c2e, glass panels rgba(255,255,255,0.05), subtle borders rgba(255,255,255,0.08). Text primary #f5f5f7, secondary #86868b.

- Light palette: bg #ffffff, elevated #f5f5f7, text #1d1d1f, secondary #86868b.

- Accent colors (iOS system): blue #0A84FF, green #30D158 (paid/connected), orange #FF9F0A (pending), red #FF453A (overdue/error), purple #BF5AF2, teal #64D2FF.

- Signature element = frosted glass cards: translucent background, heavy backdrop blur (40px) with saturate(180%), 0.5px hairline borders, 16px radius for cards / 20px for modals / 12px for small elements / 10px for buttons. No heavy shadows in dark mode; barely-there shadows in light mode.

- Smooth transitions and subtle micro-animations everywhere. Add soft layered background gradients — light blue, teal, and purple "liquid glass" orbs at low opacity (8–15%) with large blurs behind the content.




DATABASE — create these entities (tables):

- Client: name, channelUrl, channelThumbnail, channelSummary, offers (long text), contentStrategy (long text), planType (enum: TEAM_ONLY, PERSONAL_INVOLVED, CUSTOM), customPlanLabel, setupFee (number, default 30000), monthlyFee (number), startDate, status (enum: ACTIVE, CHURNED, default ACTIVE), discordServerId, googleAccountEmail, notes (long text).

- Payment: client (ref to Client), amount, type (enum: SETUP, MONTHLY), dueDate, paidDate, status (enum: PENDING, PAID, OVERDUE).

- TeamMember: client (ref to Client), role (enum: CHANNEL_MANAGER, SHORT_FORM_EDITOR, LONG_FORM_EDITOR, THUMBNAIL_DESIGNER), name, cost (monthly cost number).

- ClientProgress: client (ref to Client), stage (enum: WAITING_FOR_FOOTAGE, FILMING, EDITING_SHORT_FORM, EDITING_LONG_FORM, DESIGNING_THUMBNAIL, IN_REVIEW, UPLOADING, PUBLISHED), source (enum: MANUAL, AI_DISCORD), notes, updatedAt.

- AnalyticsSnapshot: client (ref to Client), date, views, subscribers, watchHours, impressionsCTR, topVideos (JSON/long text).

- IdeationThread: title, client (optional ref), createdAt.

- IdeationMessage: thread (ref to IdeationThread), role (user/assistant), content (long text), timestamp.

- ThumbnailSession: client (ref to Client), title, createdAt.

- ThumbnailMessage: session (ref to ThumbnailSession), role (user/assistant), content (long text), imageUrl (optional), rating (number 1–5, optional), timestamp.

- KnowledgeEntry: scope (enum: THUMBNAIL_GLOBAL, VIDEO_GLOBAL, CLIENT_TITLES, CLIENT_IDEAS), client (optional ref), userInput (long text), learnedPrinciple (long text), timestamp. (This replaces the old local training .txt files — same idea, stored in the DB.)

- Lead: name, channelUrl, notes, status (enum: TO_CONTACT, CONTACTED, IN_TALKS, CLOSED, LOST), upfrontCash (number), monthlyRecurring (number).

- AppSetting: key, value (long text). (Used to store API keys / config and integration status.)




NAVIGATION — left sidebar, collapsible (260px expanded, 72px icon-only collapsed), same pure-black background as the page with a 0.5px right border. Add a thin top bar so window controls never overlap content. Sidebar items, in this order:

1. Dashboard  2. Money  3. Clients  4. Calendar  5. Leads  6. Ideation  7. Thumbnails  8. Analytics  9. Team  10. Onboarding  11. Settings




For this first pass, build the full design system, the database, the sidebar, and a placeholder page for each tab with its title and a glass card that says "coming soon." We'll build out each tab in the next prompts. Start with an empty database — no sample/placeholder data.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://liquidglass-hq.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d37b51a6-0520-45ff-8aa0-943f90a1b9c1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
