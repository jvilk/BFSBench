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
  loggingFs[prop] = (...args) => {
    return log.logEvent.apply(log, [prop].concat(<any>args));
  };
});

loggingFs['exit'] = (cb: Function) => {
  log.end(cb);
};

export = loggingFs;
