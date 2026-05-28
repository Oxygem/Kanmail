-- Track the screen each window was on plus its bounds, so we can detect
-- when the saved global coordinates no longer land on the same display
-- (e.g. monitor unplugged or system display arrangement changed).
ALTER TABLE window_state ADD COLUMN screen_id     TEXT    NOT NULL DEFAULT '';
ALTER TABLE window_state ADD COLUMN screen_x      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE window_state ADD COLUMN screen_y      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE window_state ADD COLUMN screen_width  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE window_state ADD COLUMN screen_height INTEGER NOT NULL DEFAULT 0;
