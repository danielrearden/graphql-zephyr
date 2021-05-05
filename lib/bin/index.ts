#!/usr/bin/env node

import { cli } from "./cli";

cli.parseAsync(process.argv).catch(console.log);
