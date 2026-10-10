begin;
-- INSERT RETURNING checks SELECT before an AFTER trigger's membership is visible.
-- The row's verified owner is an explicit read predicate, independent of helpers.
drop policy pets_read on pet.pets;
create policy pets_read on pet.pets for select to chordjai_app using (
  owner_id = (select public.current_user_id()) or public.is_pet_member(id)
  or public.has_clinic_grant(id,'summary.read')
);
commit;
