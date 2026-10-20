# Dionce Creativity MVP starter

This is the next build stage after the visual prototype: a mobile-first web app scaffold with:
- Supabase authentication hooks (email/password)
- Published-books loading from the database
- A private author dashboard scaffold for book drafts and publish/unpublish
- Database schema for books, chapters, comments, reading progress, saved books, profiles, and announcements
- Row Level Security policies designed so readers only see published books/chapters and only the owner/admin can publish content
- Local demo fallback while Supabase is not configured
- Your logo and supplied book-cover assets

## First: preview locally
Because `app.js` uses JavaScript modules, open the folder using a local web server (not by double-clicking `index.html`). If you have Python installed, open a terminal in this folder and run:
`python3 dev-server.py`
(It works like `python3 -m http.server 8000`, but stops the browser caching old files, so code changes show on a normal refresh.)
Then visit `http://localhost:8000`.

## Connect the real backend (Supabase)
1. Create a project at https://supabase.com.
2. In the Supabase dashboard, open SQL Editor and run `supabase/schema.sql`, then `supabase/002_mvp_features.sql` (discussions, cover storage, automatic chapter counts), then `supabase/003_passage_comments.sql` (highlight comments), then `supabase/004_signin_to_read.sql` (first 2 chapters free, the rest need sign-in; change the number in `free_chapter_count()`).
3. In Authentication > URL Configuration, add your eventual site URL and your local preview URL to the allowed redirect URLs.
4. Create an account from the app's Profile screen.
5. In SQL Editor, promote your own account to admin, replacing the email:
   `update public.profiles p set role='admin' from auth.users u where p.id=u.id and u.email='YOUR-LOGIN-EMAIL-HERE';`
6. Copy your project URL and anon/publishable key from Project Settings > API, then paste them into `config.js`.
   - The URL and anon/publishable key are designed for browser use with Row Level Security.
   - NEVER use a `service_role` or secret key in browser code.
7. Refresh, sign in, and open Author dashboard.
8. On the Profile screen, set your display name (e.g. Dionetta Ekwe). It is shown as the author byline on every book.

## Deploy
You can deploy this static starter to Netlify, Vercel, or Cloudflare Pages. Set the root directory to this folder and configure the production domain in Supabase Authentication URL Configuration. Add HTTPS before enabling web push notifications.

## Current scope / honest limitations
- Author dashboard: create/edit/delete books, upload covers, write and publish chapters, reorder chapters. Updates/announcements are posted and edited on the Updates page when signed in as admin.
- Readers: real chapter lists, comments with replies, community discussions, Updates feed (new chapters + announcements), saved books and reading progress synced to the account when signed in (browser-only when signed out).
- Accounts: sign up, sign in, password reset, display name.
- Highlight comments: readers select text in a chapter and tap Comment; highlighted passages show in the text. To try it, run `supabase/seed_test_book.sql` (after making your account admin) to add a test book.
- Not built yet: push notifications, moderation beyond deleting, coins/payments.
- Demo books show only while Supabase is not configured.
- Review policies and run end-to-end tests before opening registration to the public.
