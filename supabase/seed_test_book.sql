-- Test book for trying out highlight comments. Safe to re-run (does nothing if the book exists).
-- Run in Supabase Dashboard > SQL Editor. Requires an admin account (the book is credited to it).
-- To remove it later:  delete from public.books where slug = 'lantern-keeper-test';

do $$
declare
  owner_id uuid;
  book_id uuid;
begin
  select id into owner_id from public.profiles where role = 'admin' order by created_at limit 1;
  if owner_id is null then
    raise exception 'No admin account found. Promote your account to admin first (see SETUP.md).';
  end if;

  if exists (select 1 from public.books where slug = 'lantern-keeper-test') then
    raise notice 'Test book already exists; nothing to do.';
    return;
  end if;

  insert into public.books (author_id, title, slug, description, genre, status, is_published)
  values (owner_id, 'The Lantern Keeper (Test Book)', 'lantern-keeper-test',
          'A test story for trying highlight comments. Select any line while reading and tap Comment.',
          'Drama', 'ongoing', true)
  returning id into book_id;

  insert into public.chapters (book_id, chapter_number, title, body, is_published) values
  (book_id, 1, 'The Last Light on Marrow Street', $t$Every evening at six, Amara climbed the iron stairs of the old clock tower and lit the lantern her grandmother had kept burning for forty years.

Nobody in Marrow Street remembered why the lantern mattered. They only knew that on the one night it had gone dark, the river had climbed its banks and swallowed the bakery whole.

"It's superstition," her brother Tobi said, leaning against the doorframe with his arms folded. "You know that, right? A lamp can't hold back water."

Amara struck the match anyway. The flame caught, steadied, and threw a long gold line across the rooftops.

"Maybe not," she said. "But somebody has to be the one who keeps their promises around here."

Below them, the street lamps flickered once, as if in answer, and then glowed a little brighter than before.$t$, true),

  (book_id, 2, 'Letters Under the Floorboards', $t$The letters were tied with a faded green ribbon, the kind her grandmother used to wrap birthday presents in.

Amara found them by accident, kneeling to chase a runaway coin beneath the loose board by the stove. There were thirty-two envelopes, every one addressed to the same name: Emeka.

She knew no one called Emeka. Neither, she was certain, had her grandmother.

The first letter began simply: "If you are reading this, then I kept the light burning long enough."

Her hands shook. Outside, the rain started, soft at first, then hard enough to rattle the windows in their frames.

She read until the candle burned down to nothing, and by the end she understood that the lantern had never been about the river at all.$t$, true),

  (book_id, 3, 'What the River Remembers', $t$Tobi did not believe her until she put the last letter in his hands.

He read it twice, then a third time, his jaw tightening with every line. "She was waiting for someone," he said quietly. "All those years."

"Not waiting," Amara corrected. "Guiding. She thought he'd find his way home if the light never went out."

The river was loud that night, louder than either of them had ever heard it. Somewhere beneath the roar, Amara imagined she could hear oars.

At six o'clock, they climbed the tower together. Tobi held the match this time, and his hand did not shake at all.

When the flame caught, a small boat rounded the bend in the river, a single lantern swinging at its bow.$t$, true);

  raise notice 'Created "The Lantern Keeper (Test Book)" with 3 published chapters.';
end $$;
