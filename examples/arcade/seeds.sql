INSERT INTO player (name, created_at) VALUES
  ('Marin', CURRENT_TIMESTAMP),
  ('Ivo', CURRENT_TIMESTAMP),
  ('Jason', CURRENT_TIMESTAMP);
INSERT INTO game (player_id, created_at) VALUES
  (1, CURRENT_TIMESTAMP),
  (1, CURRENT_TIMESTAMP),
  (1, CURRENT_TIMESTAMP),
  (2, CURRENT_TIMESTAMP),
  (2, CURRENT_TIMESTAMP),
  (3, CURRENT_TIMESTAMP),
  (3, CURRENT_TIMESTAMP),
  (3, CURRENT_TIMESTAMP);
INSERT INTO award (name) VALUES
  ('double'),
  ('tripple'),
  ('quadra'),
  ('penta');
INSERT INTO gameaward(game_id, award_id, created_at) VALUES
  (1, 1, CURRENT_TIMESTAMP),
  (2, 1, CURRENT_TIMESTAMP),
  (3, 1, CURRENT_TIMESTAMP),
  (4, 1, CURRENT_TIMESTAMP),
  (5, 1, CURRENT_TIMESTAMP),
  (6, 1, CURRENT_TIMESTAMP),
  (7, 1, CURRENT_TIMESTAMP);
INSERT INTO gameaward(game_id, award_id, created_at) VALUES
  (4, 2, CURRENT_TIMESTAMP),
  (8, 3, CURRENT_TIMESTAMP);
