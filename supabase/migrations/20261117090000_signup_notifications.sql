-- New accounts are approved at once; the Super Admin gets a 'signup' notification for each one.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('welcome', 'signup', 'review', 'approved', 'returned', 'comment', 'assigned', 'suggestion', 'suggestion_accepted', 'suggestion_declined'));
