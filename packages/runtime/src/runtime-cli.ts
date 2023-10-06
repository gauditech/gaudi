#!/usr/bin/env node

import { configDotenv } from "dotenv";

import { readConfig } from "@runtime/config";
import { createServer } from "@runtime/server/server";

// read ".env" file from cwd
configDotenv({});

// read cofig
const config = readConfig();

// start server
createServer(config);
