-- CREATE TABLES


CREATE TABLE player (
    id               serial,
    name             text NOT NULL DEFAULT '',
    created_at       timestamp NOT NULL
);

CREATE TABLE game (
    id               serial,
    created_at       timestamp NOT NULL,
    player_id        int NOT NULL
);


-- FOREIGN KEYS


ALTER TABLE game ADD CONSTRAINT fk_id FOREIGN_KEY (id) REFERENCES player(id) ON DELETE NO ACTION ON UPDATE CASCADE;