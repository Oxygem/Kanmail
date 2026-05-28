-- Wails v3.0.0-alpha.91 normalised the macOS coordinate system: Position()/
-- SetPosition() now report logical points (Y-down, primary screen top-left =
-- origin), whereas earlier alphas returned points x primaryScale with a
-- Retina-halved Bounds. Any rows saved before that change would restore the
-- window to the wrong spot, so wipe them and let the next run repopulate.
DELETE FROM window_state;
