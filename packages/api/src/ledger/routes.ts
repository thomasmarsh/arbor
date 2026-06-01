import { createServer, respond } from '@arbor/router';
import { parseLedger, computeDisplayGroups } from './reader.js';
import { ledgerPath } from './path.js';
import { ledgerRouter } from './router.js';

export { ledgerRouter };

export const ledgerServer = createServer(ledgerRouter, {
  'ledger-get-tasks': async (_ctx) => {
    const { tasks, waves } = parseLedger(ledgerPath());
    return respond(200, { tasks, waves });
  },
  'ledger-get-queue': async (_ctx) => {
    const { tasks, waves } = parseLedger(ledgerPath());
    return respond(200, computeDisplayGroups(tasks, waves));
  },
  'ledger-get-task': async (ctx) => {
    const { tasks } = parseLedger(ledgerPath());
    const task = tasks.find((t) => t.id === ctx.params.id);
    return task ? respond(200, task) : respond(404, { error: `Task ${ctx.params.id} not found` });
  },
});
