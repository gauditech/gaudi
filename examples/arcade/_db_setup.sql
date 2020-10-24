-- CREATE TABLES


CREATE TABLE player (
    id               serial PRIMARY KEY,
    name             text NOT NULL DEFAULT '',
    created_at       timestamp NOT NULL
);

CREATE TABLE game (
    id               serial PRIMARY KEY,
    created_at       timestamp NOT NULL,
    player_id        int NOT NULL
);

CREATE TABLE gameaward (
    id               serial PRIMARY KEY,
    created_at       timestamp NOT NULL,
    game_id          int NOT NULL,
    award_id         int NOT NULL
);

CREATE TABLE award (
    id       serial PRIMARY KEY,
    name     text NOT NULL DEFAULT ''
);


-- FOREIGN KEYS


ALTER TABLE game ADD CONSTRAINT fk_player_id FOREIGN KEY (player_id) REFERENCES player(id) ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE gameaward ADD CONSTRAINT fk_game_id FOREIGN KEY (game_id) REFERENCES game(id) ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE gameaward ADD CONSTRAINT fk_award_id FOREIGN KEY (award_id) REFERENCES award(id) ON DELETE NO ACTION ON UPDATE CASCADE;