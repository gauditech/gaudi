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


-- FOREIGN KEYS


ALTER TABLE game ADD CONSTRAINT fk_player_id FOREIGN KEY (player_id) REFERENCES player(id) ON DELETE NO ACTION ON UPDATE CASCADE;