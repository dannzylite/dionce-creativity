-- Dionce Creativity: passage (highlight) comments
-- Run in Supabase Dashboard > SQL Editor AFTER 002_mvp_features.sql. Safe to re-run.
-- The passage columns already exist on public.comments (schema.sql); this keeps their values sane.

alter table public.comments drop constraint if exists comments_passage_check;
alter table public.comments add constraint comments_passage_check check (
  passage_quote is null
  or (
    char_length(passage_quote) between 1 and 1000
    and passage_start >= 0
    and passage_end > passage_start
    and parent_id is null -- replies belong to their parent's passage
  )
);
