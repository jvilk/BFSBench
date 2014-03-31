/// <reference path="../lib/DefinitelyTyped/node/node.d.ts" />
/**
 * Command line tool to generate files with random contents.
 * Uses a controllable random seed to deterministically generate test data.
 */
import path = require('path');
import fs = require('fs');
var seed = require('seed-random'),
  argv = require('yargs')
  .usage("$0 -s [random seed] -n [num files] -o [output folder] -a [avg. file size]")
  .options({
    's': {
      alias: 'seed',
      type: 'string'
    }, 'n': {
      alias: 'num-files'
    }, 'o': {
      alias: 'outDir',
      type: 'string'
    }, 'a': {
      alias: 'averageSize'
    }
  }).demand(['s', 'n', 'o', 'a']).check(checkArgs).argv,
  seedVal: string = argv.s,
  numFiles: number = parseInt(argv.n, 10),
  outDir: string = path.resolve(argv.o),
  avgSize: number = parseInt(argv.a, 10),
  random: () => number = seed(seedVal),
  i: number;

function checkArgs(argv: any): void {
  ['n', 'a'].forEach((val: string): void => {
    if (isNaN(parseInt(argv[val], 10))) throw val + " must be a number.";
  });
}

function createFile(num: number): void {
  var size: number = random() * avgSize, i: number,
    words: number = Math.floor(size / 4), contents = new Buffer(size);
  for (i = 0; i < words; i++) {
    // Max unsigned integer.
    // >>> 0 coerces the number into an *unsigned* integer.
    contents.writeUInt32LE((4294967295 * random()) >>> 0, i*4);
  }
  // Remainder.
  // >>> 0 coerces the number into an *unsigned* integer.
  for (i = 0; i < size % 4; i++) {
    contents.writeUInt8((255 * random()) >>> 0, words * 4 + i);
  }
  fs.writeFileSync(path.join(outDir, 'file' + num + '.dat'), contents);
}

console.log("Writing " + numFiles + " files to " + outDir + " with average size " + avgSize + " bytes using random seed " + seedVal + ".");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir);
}
for (i = 0; i < numFiles; i++) {
  createFile(i);
}

