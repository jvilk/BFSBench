/// <reference path="../lib/DefinitelyTyped/node/node.d.ts" />
import event_logger = require('./event_logger');
var argv = process.argv;

if (argv.length !== 5) {
  console.log("Usage: node " + argv[1] + " [name of record] [data directory] [iters]");
  process.exit();
}

process.chdir(argv[3]);
var iters = parseInt(argv[4], 10), currIter: number = 0;
function nextIter() {
  if (currIter === iters) {
    return;
  } else {
    currIter++;
    new event_logger.EventReplay(argv[2], nextIter);
  }
}
nextIter();
