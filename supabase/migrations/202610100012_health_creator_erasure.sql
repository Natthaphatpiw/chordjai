begin;
-- Health records belong to the pet. Erasing a carer anonymizes attribution;
-- erasing the pet still cascades the medical record through records.pet_id.
alter table health.records drop constraint records_created_by_fkey;
alter table health.records alter column created_by drop not null;
alter table health.records add constraint records_created_by_fkey
  foreign key(created_by) references identity.users(id) on delete set null;
commit;
