-- Migration: add max_passengers to cars and split_4p_driver to settings

-- cars: nullable integer; null means the app default (3) applies
ALTER TABLE cars ADD COLUMN IF NOT EXISTS max_passengers integer;

-- settings: 4-passenger driver split, default 16% (driver 16%, 4×21% passengers)
ALTER TABLE settings ADD COLUMN IF NOT EXISTS split_4p_driver integer NOT NULL DEFAULT 16;

-- Update the existing car owned by the app owner to 4 passengers
UPDATE cars
SET max_passengers = 4
WHERE owner_user_id = (
  SELECT id FROM auth.users WHERE email = 'alessandrorafaelcruz@gmail.com'
);
