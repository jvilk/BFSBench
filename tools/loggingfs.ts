/// <reference path="../lib/DefinitelyTyped/node/node.d.ts" />
/**
 * LoggingFS
 * A wrapper for Node's file system that efficiently logs all file system
 * accesses for later replay.
 */
import event_logger = require('./event_logger');
import fs = require('fs');

var log = new event_logger.EventLog('dataLog'), loggingFs = {}, prop;

Object.keys(fs).forEach((prop) => {
  loggingFs[prop] = () => {
    return log.logEvent.apply(log, arguments);
  };
});

loggingFs['exit'] = (cb: Function) => {
  log.end(cb);
};

export = loggingFs;
