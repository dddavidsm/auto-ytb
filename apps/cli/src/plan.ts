import { readFile } from 'node:fs/promises';
import { allocateSearchBudget, type QueryLane } from '@auto-ytb/core';
const config = JSON.parse(await readFile(`${process.cwd()}/config/search-budget.json`, 'utf8')) as { dailySearchCalls:number; lanes:QueryLane[] };
console.table(allocateSearchBudget(config.dailySearchCalls, config.lanes));
