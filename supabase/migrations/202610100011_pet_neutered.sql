begin;
-- NULL = unknown/not entered; existing profiles remain valid.
alter table pet.pets add column neutered boolean;
commit;
