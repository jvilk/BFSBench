/// <reference path="../lib/DefinitelyTyped/node/node.d.ts" />
/**
 * LoggingFS
 * A wrapper for Node's file system that efficiently logs all file system
 * accesses for later replay.
 */
import fs = require('fs');
// Stress test idea on entire JCL; see if object can hold all of the strings.
// Use ASCII for performance?
/**
 * LOG FORMAT
 * 
 * High level:
 * << header >>
 * << string pool >>
 * << events >>
 * 
 * Header:
 *   u32: Event offset. Offset in the file where the events begin.
 * 
 * String pool:
 * << string pool header >>
 * << string pool index >>
 * << string pool entry >>
 * << string pool entry >>
 * ...
 * 
 * String pool header:
 *   u32: # of entries in string pool.
 * 
 * String pool index:
 *   For each item in the string pool:
 *     u32: Entry offset
 *     u16: Entry length
 * 
 * String pool entry:
 *   utf-8 string
 * 
 * Events:
 * << events header >>
 * << event entry >>
 * << event entry >>
 * ...
 * 
 * Events Header:
 *   u32: Number of events present.
 * 
 * Event entry:
 *   u8: Event type.
 *   u32: Arg 1 (String pool entry or file descriptor)
 * 
 */
