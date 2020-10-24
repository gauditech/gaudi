#!/bin/bash

docker-compose exec -u postgres postgres dropdb gaudi
docker-compose exec -u postgres postgres createdb gaudi
psql -U postgres -p 5401 -h localhost gaudi < examples/arcade/_db_setup.sql
psql -U postgres -p 5401 -h localhost gaudi < examples/arcade/seeds.sql
