alter table public.round_actions
drop constraint if exists round_actions_trait_check;

alter table public.round_actions
add constraint round_actions_trait_check
check (
  trait in (
    'STRENGTH',
    'RESISTANCE',
    'AGILITY',
    'PERCEPTION',
    'METABOLISM',
    'ADAPTATION',
    'GRIP_CLAWS',
    'CAMOUFLAGE',
    'WEBBED_LIMBS',
    'FAT_RESERVES'
  )
);