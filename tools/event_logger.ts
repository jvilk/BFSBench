/// <reference path="../lib/DefinitelyTyped/node/node.d.ts" />
/// <amd-dependency path="buffer" />
/**
 * LoggingFS event logger API.
 */
import assert = require('assert');
import path = require('path');
import fs = require('fs');
var Buffer = require('buffer').Buffer;

declare var BrowserFS;

/**
 * Event types.
 */
export enum EventType {
  /* Node API calls */
  rename, renameSync,
  ftruncate, ftruncateSync,
  truncate, truncateSync,
  stat, lstat, statSync, lstatSync,
  fstat, fstatSync,
  unlink, unlinkSync,
  rmdir, rmdirSync,
  mkdir, mkdirSync,
  readdir, readdirSync,
  close, closeSync,
  open, openSync,
  fsync, fsyncSync,
  write, writeSync,
  read, readSync,
  readFile, readFileSync,
  writeFile, writeFileSync,
  appendFile, appendFileSync,
  exists, existsSync
  /* Logging events */
  // EVENT_END // Used for asynchronous events.
}

export enum EncodingType {
  NA = 0, /* Reserve 0 for N/A */
  utf8, ascii, binary, ucs2, hex, base64, buffer
}

export function str2EncodingType(str: string): EncodingType {
  switch (str.toLowerCase()) {
    case 'utf8':
    case 'utf-8':
      return EncodingType.utf8;
    case 'ascii':
      return EncodingType.ascii;
    case 'binary':
      return EncodingType.binary;
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return EncodingType.ucs2;
    case 'hex':
      return EncodingType.hex;
    case 'base64':
      return EncodingType.base64;
    default:
      if (str === null) {
        return EncodingType.buffer;
      }
      throw new Error("Invalid encoding type: " + str);
  }
}

export function encodingType2Str(type: EncodingType): string {
  var str: string;
  if (type === EncodingType.buffer) {
    return null;
  }
  str = EncodingType[type];
  if (str === undefined) {
    throw new Error("Invalid encoding type: " + type);
  }
  if (str === 'NA') str = undefined;
  return str;
}

/**
 * Enum for all possible Node file flags.
 */
export enum FlagEnum {
  NA = 0, /* Reserve 0 for N/A */
  r, r_plus, rs, rs_plus, w, wx, w_plus, wx_plus, a, ax, a_plus, ax_plus
}

export function flag2Enum(flag: string): FlagEnum {
  switch(flag) {
    case 'r':
      return FlagEnum.r;
    case 'r+':
      return FlagEnum.r_plus;
    case 'rs':
      return FlagEnum.rs;
    case 'rs+':
      return FlagEnum.rs_plus;
    case 'w':
      return FlagEnum.w;
    case 'wx':
      return FlagEnum.wx;
    case 'w+':
      return FlagEnum.w_plus;
    case 'wx+':
      return FlagEnum.wx_plus;
    case 'a':
      return FlagEnum.a;
    case 'ax':
      return FlagEnum.ax;
    case 'a+':
      return FlagEnum.a_plus;
    case 'ax+':
      return FlagEnum.ax_plus;
    default:
      throw new Error("Invalid flag: " + flag);
  }
}

export function flagEnum2String(flag: FlagEnum): string {
  var str: string = FlagEnum[flag];
  str = str.replace('_plus', '+');
  if (str === 'NA') str = undefined;
  return str;
}

function options2Number(options: {flag: string; encoding: string}): number {
  var rv: number = 0;
  if (options != null && typeof options !== 'function') {
    if (options.flag) {
      rv |= flag2Enum(options.flag);
      rv << 16;
    }
    if (options.encoding) {
      rv |= str2EncodingType(options.encoding);
    }
  }
  return rv;
}

export function number2Options(opts: number): {flag: string; encoding: string} {
  return {
    flag: flagEnum2String(opts >>> 16),
    encoding: encodingType2Str(opts & 0xFFFF)
  };
}

function getStackTrace(): string {
  try {
    throw new Error();
  } catch (e) {
    return e.stack;
  }
}

enum ReplayerStatus { RUNNING, SUSPENDED }

var getTime: () => number = (() => {
  return typeof performance !== 'undefined' ? () => { return performance.now(); } : () => { return Date.now(); };
})();

export class EventReplay {
  private stringPool: NodeBuffer;
  private currentEvent: number = 0;
  private events: Event[];
  private status: ReplayerStatus = ReplayerStatus.SUSPENDED;
  private startTime: number;
  private endTime: number;
  /**
   * All of the paths that are currently involved in FS events, including those
   * involved in FDs.
   * Instead of using the actual path, we use the path id to save space.
   * We don't care about the value stored for each path; this is used as a set.
   */
  private lockedPaths: {[path: number]: any} = {};
  /**
   * All of the file descriptors that are currently involved in FS events.
   * We map from the eventId in which they are created to both the path and
   * fd number.
   */
  private activeFds: { [eventId: number]: { path: number; fd: number } } = {};
  private eventsLeft: number;
  public sync2async: boolean = BrowserFS && (!(<any>fs).getRootFS().supportsSynch());

  constructor(name: string, private endCb: Function = () => { }) {
    var counter: number = 2;
    fs.readFile(name + '_events.dat', (err, buff: NodeBuffer): void => {
      if (err) throw err;
      this.processEvents(buff);
      if (--counter === 0) this.start();
      fs.readFile(name + '_stringpool.dat', (err, buff: NodeBuffer): void => {
        if (err) throw err;
        this.stringPool = buff;
        if (--counter === 0) this.start();
      });
    });
  }

  public getCurrentEventId(): number { return this.currentEvent; }

  public getString(stringId: number): string {
    var stringLength: number = this.stringPool.readUInt32LE(stringId),
      str = this.stringPool.toString('utf8', stringId + 4, stringId + 4 + stringLength);
    // XXX: Fix for javap benchmark.
    var badDir: string = "../../../doppio_really_upstream/doppio/build/release-cli/";
    if (str.indexOf(badDir) === 0) {
      str = str.slice(badDir.length);
    }
    // '.' gets replaced with '' in the string pool.
    return str === '' ? '.' : str;
  }

  public lockPath(stringId: number): void {
    if (this.lockedPaths.hasOwnProperty(""+stringId)) {
      throw new Error("Path " + stringId + " is already locked.");
    } else {
      this.lockedPaths[stringId] = null;
    }
  }

  /**
   * Attempts to lock all of the specified paths.
   * If one of the paths cannot be locked, it locks nothing and throws an
   * exception.
   */
  public lockPaths(stringIds: number[]): void {
    var i: number;
    try {
      for (i = 0; i < stringIds.length; i++) {
        this.lockPath(stringIds[i])
      }
    } catch (e) {
      // Unlock everything locked thus far -- abort!
      if (i > 0) {
        this.unlockPaths(stringIds.slice(0, i));
      }
      throw e;
    }
  }

  public lookupFd(eventId: number): number {
    this.assertFdExists(eventId);
    return this.activeFds[eventId].fd;
  }

  public unlockPath(stringId: number): void {
    if (this.lockedPaths.hasOwnProperty(""+stringId)) {
      delete this.lockedPaths[stringId];
    } else {
      throw new Error("Path " + stringId + " is not locked!");
    }
  }

  /**
   * Unlocks all of the specified paths. It is a fatal error if the replayer
   * attempts to unlock something that is not locked.
   */
  public unlockPaths(stringIds: number[]): void {
    var i: number;
    for (i = 0; i < stringIds.length; i++) {
      this.unlockPath(stringIds[i]);
    }
  }

  private assertFdExists(eventId: number): void {
    if (!this.activeFds.hasOwnProperty(""+eventId)) {
      var append = "";
      if (eventId < this.events.length && eventId >= 0) {
        var event: Event = this.events[eventId];
        append = event.toString(this);
      }
      throw new Error("fd for event " + eventId + " does not exist. " + append);
    }
  }

  private assertFdMissing(eventId: number): void {
    if (this.activeFds.hasOwnProperty(""+eventId)) {
      throw new Error("Event " + eventId + " already has a file descriptor registered.");
    }
  }

  public registerFd(eventId: number, fd: number, stringId: number): void {
    this.assertFdMissing(eventId);
    this.activeFds[eventId] = {fd: fd, path: stringId};
    //console.log('Opened ' + this.getString(stringId));
  }

  public lockFd(eventId: number): void {
    this.assertFdExists(eventId);
    var eventDetails = this.activeFds[eventId];
    this.lockPath(eventDetails.path);
  }

  public unlockFd(eventId: number): void {
    this.assertFdExists(eventId);
    var eventDetails = this.activeFds[eventId];
    this.unlockPath(eventDetails.path);
  }

  public unregisterFd(eventId: number): void {
    if (this.activeFds.hasOwnProperty(""+eventId)) {
      // Ensure it's unlocked before removing.
      try {
        this.unlockFd(eventId);
      } catch (e) {}
      //console.log('Closed ' + this.getString(this.activeFds[eventId].path));
      delete this.activeFds[eventId];
    } else {
      throw new Error("fd for event " + eventId + " does not exist.");
    }
  }

  public endEvent() {
    if (--this.eventsLeft === 0) {
      this.end();
    }
  }

  private processEvents(buff: NodeBuffer): void {
    // Segment into 13-byte slices, create events for each.
    // @todo This could be done lazily...
    var numEvents: number = buff.length / 13, i: number, offset: number;
    // Assertion: buff.length should divide evenly by 13.
    assert(numEvents === (numEvents >>> 0));
    this.events = new Array(numEvents);
    for (i = 0; i < numEvents; i++) {
      offset = i*13;
      this.events[i] = new Event(buff.slice(offset, offset + 13));
      if (this.sync2async) this.events[i].makeAsync();
    }
    this.eventsLeft = this.events.length;
  }

  private start(): void {
    this.startTime = getTime();
    this.ready();
  }

  public ready(): void {
    if (this.status === ReplayerStatus.SUSPENDED) {
      this.status = ReplayerStatus.RUNNING;
      // Keep running events until we are blocked.
      try {
        for (; this.currentEvent < this.events.length; this.currentEvent++) {
          this.events[this.currentEvent].run(this);
        }
      } catch (e) {
        // Exception means we should suspend. Ignore and suspend.
        // console.log("Received exception: " + e + '\n' + e.stack);
      }

      this.status = ReplayerStatus.SUSPENDED;
    }
  }

  public end(): void {
    this.endTime = getTime();
    // Fixes issues when last event is synchronous. If we didn't do this, the
    // event loop would not register the last event and we would think we ended
    // prematurely.
    setTimeout(() => {
      if (this.currentEvent !== this.events.length) {
        var event: Event = this.events[this.currentEvent];
        console.log('Execution ended on event ' + this.currentEvent + '/' + this.events.length);
        console.log('Problematic event is: ');
        console.log(EventType[event.type()] + '(' + event.arg1() + ', ' + event.arg2() + ', ' + event.arg3() + ')');
        console.log('Next event is: ' + this.events[this.currentEvent + 1].toString(this));
        console.log('Current locks: ' + JSON.stringify(Object.keys(this.lockedPaths)));
        console.log('Current fds: ');
        for (var fd in this.activeFds) {
          console.log(fd + ' => ' + this.getString(this.activeFds[fd].path));
        }
      }
      console.log("Total time elapsed: " + (this.endTime - this.startTime) + " ms");
      this.endCb(this.endTime - this.startTime);
    }, 4);
  }
}

export class EventLog {
  /**
   * Maps strings to their numerical IDs.
   */
  private stringPool: { [name: string]: number } = {};
  /**
   * Current offset in the string pool file.
   */
  private stringPoolPosition: number = 0;
  private fdMap: {[eventId: number]: number} = {};
  /**
   * Stream for the file holding the string pool.
   */
  private stringPoolStream: fs.WriteStream;
  /**
   * Stream for the file holding the events.
   */
  private eventStream: fs.WriteStream;
  /**
   * Number of events thus far.
   */
  private eventCount: number = 0;
  constructor(name: string) {
    this.eventStream = fs.createWriteStream(name + '_events.dat', { flags: 'w' });
    this.stringPoolStream = fs.createWriteStream(name + '_stringpool.dat', { flags: 'w' });
  }

  public end(cb: Function = () => { }): void {
    var counter: number = 2,
      ourCb = () => {
        if (--counter === 0) cb();
      };
    this.stringPoolStream.on('finish', ourCb);
    this.eventStream.on('finish', ourCb);
    this.stringPoolStream.end();
    this.eventStream.end();
  }

  public addString(str: string): number {
    var buff: NodeBuffer, lenBuff: NodeBuffer;
    // Check if present, otherwise write.
    if (this.stringPool[str] == null) {
      this.stringPool[str] = this.stringPoolPosition;
      lenBuff = new Buffer(4);
      buff = new Buffer(str);
      lenBuff.writeUInt32LE(buff.length, 0);
      this.stringPoolPosition += buff.length + 4;
      // Prefix each string by its length.
      this.stringPoolStream.write(lenBuff);
      this.stringPoolStream.write(buff);
    }
    return this.stringPool[str];
  }
  public addPathString(p: string): number {
    return this.addString(path.relative('.', path.resolve(p)));
  }

  public registerFd(eventId: number, fd: number): void {
    this.fdMap[fd] = eventId;
  }
  public getFdEvent(fd: number): number {
    if (this.fdMap[fd] == null) {
      throw new Error("Invalid fd.");
    }
    return this.fdMap[fd];
  }

  private recordEvent(event: Event): void {
    this.eventStream.write(event.data);
    this.eventCount++;
  }

  /**
   * Logs this function call, and then returns the result from forwarding it to
   * the true `fs` module.
   */
  public logEvent(methodName: string, arg1: any, arg2?: any, arg3?: any, arg4?: any, arg5?: any, arg6?: any): any {
    var type: EventType = EventType[methodName];
    switch (type) {
      /* (path) */
      case EventType.stat:
      case EventType.lstat:
      case EventType.unlink:
      case EventType.rmdir:
      case EventType.readdir:
      case EventType.exists:
      case EventType.statSync:
      case EventType.lstatSync:
      case EventType.unlinkSync:
      case EventType.rmdirSync:
      case EventType.readdirSync:
      case EventType.existsSync:
        assert(typeof arg1 === 'string');
        this.recordEvent(new Event(type, this.addPathString(arg1)));
        break;
      /* (path, path) */
      case EventType.rename:
      case EventType.renameSync:
        assert(typeof arg1 === 'string');
        assert(typeof arg2 === 'string');
        this.recordEvent(new Event(type, this.addPathString(arg1), this.addPathString(arg2)));
        break;
      /* (fd, len) */
      case EventType.ftruncate:
      case EventType.ftruncateSync:
        //assert(typeof arg1 === 'number');
        assert(typeof arg2 === 'number');
        this.recordEvent(new Event(type, this.getFdEvent(arg1), arg2));
        break;
      /* (path, len) */
      case EventType.truncate:
      case EventType.truncateSync:
        assert(typeof arg1 === 'string');
        assert(typeof arg2 === 'number');
        this.recordEvent(new Event(type, this.addPathString(arg1), arg2));
        break;
      /* (fd) */
      case EventType.fstat:
      case EventType.fstatSync:
      case EventType.close:
      case EventType.closeSync:
      case EventType.fsync:
      case EventType.fstatSync:
        //assert(typeof arg1 === 'number');
        this.recordEvent(new Event(type, this.getFdEvent(arg1)));
        break;
      /* (path, mode?) */
      case EventType.mkdir:
      case EventType.mkdirSync:
        assert(typeof arg1 === 'string');
        this.recordEvent(new Event(type, this.addPathString(arg1), arg2));
        break;
      /* (path flags mode?) */
      case EventType.open:
        // Modify callback to capture fd.
        var openCbCapture = (cb: Function): Function => {
          var eventId = this.eventCount;
          return (err, fd): void => {
            if (!err) {
              this.registerFd(eventId, fd);
            }
            cb(err, fd);
          };
        };
        if (typeof arg3 === 'function') {
          arg3 = openCbCapture(arg3);
        } else if (typeof arg4 === 'function') {
          arg4 = openCbCapture(arg4);
        }
      case EventType.openSync:
        assert(typeof arg1 === 'string');
        assert(typeof arg2 === 'string');
        this.recordEvent(new Event(type, this.addPathString(arg1), flag2Enum(arg2), arg3));
        break;
      /* (fd buffer offset length position) */
      case EventType.read:
      case EventType.readSync:
      case EventType.write:
      case EventType.writeSync:
        //assert(typeof arg1 === 'number');
        assert(Buffer.isBuffer(arg2));
        assert(typeof arg3 === 'number');
        assert(typeof arg4 === 'number');
        assert(typeof arg5 === 'number' || arg5 === null);
        // Reduce this information to (fd, length, position).
        // XXX: Use max u32 as null sentinel
        this.recordEvent(new Event(type, this.getFdEvent(arg1), arg4,
          arg5 === null ? 4294967295 : arg5));
        break;
      /* (path buff options?) */
      case EventType.writeFile:
      case EventType.writeFileSync:
      case EventType.appendFile:
      case EventType.appendFileSync:
        // Convert to path, length, options
        assert(typeof arg1 === 'string');
        assert(Buffer.isBuffer(arg2));
        this.recordEvent(new Event(type, this.addPathString(arg1), arg2.length, options2Number(arg3)));
        break;
      /* (path options?) */
      case EventType.readFile:
      case EventType.readFileSync:
        assert(typeof arg1 === 'string');
        this.recordEvent(new Event(type, this.addPathString(arg1), options2Number(arg2)));
        break;
      default:
        console.log("Ignoring and forwarding event type: " + methodName);
        break;
    }
    // Call the function.
    var rv: any;
    if (arg6 !== undefined) {
      rv = fs[methodName](arg1, arg2, arg3, arg4, arg5, arg6);
    } else if (arg5 !== undefined) {
      rv = fs[methodName](arg1, arg2, arg3, arg4, arg5);
    } else if (arg4 !== undefined) {
      rv = fs[methodName](arg1, arg2, arg3, arg4);
    } else if (arg3 !== undefined) {
      rv = fs[methodName](arg1, arg2, arg3);
    } else if (arg2 !== undefined) {
      rv = fs[methodName](arg1, arg2);
    } else {
      rv = fs[methodName](arg1);
    }
    if (methodName === 'openSync') {
      // XXX: Decrement 1 from eventCount, since we are already recorded.
      this.registerFd(this.eventCount - 1, rv);
    }
    return rv;
  }
}

export class Event {
  public data: NodeBuffer;
  /* Used during event recording. */
  constructor(type: EventType, arg1: number, arg2?: number, arg3?: number);
  /* Used during event replay. */
  constructor(data: NodeBuffer);
  constructor(td: any, arg1: number = 0, arg2: number = 0, arg3: number = 0) {
    if (Buffer.isBuffer(td)) {
      this.data = td;
    } else {
      this.data = new Buffer(13);
      this.data.writeUInt8(td, 0);
      if (typeof arg1 !== 'number') arg1 = 0;
      if (typeof arg2 !== 'number') arg2 = 0;
      if (typeof arg3 !== 'number') arg3 = 0;
      this.data.writeUInt32LE(arg1, 1);
      this.data.writeUInt32LE(arg2, 5);
      this.data.writeUInt32LE(arg3, 9);
    }
  }
  public makeAsync(): void {
    var typeName: string = EventType[this.type()];
    if (typeName.indexOf('Sync') !== -1) {
      var newType: EventType = EventType[typeName.slice(0, typeName.length - 4)];
      assert(newType !== null && newType !== undefined);
      this.data.writeUInt8(newType, 0);
    }
  }
  public type(): EventType { return this.data.readUInt8(0); }
  public arg1(): number { return this.data.readUInt32LE(1); }
  public arg2(): number { return this.data.readUInt32LE(5); }
  public arg3(): number { return this.data.readUInt32LE(9); }

  public toString(replayer: EventReplay): string {
    var pathStr = "" + this.arg1();
    try {
      pathStr = replayer.getString(this.arg1());
    } catch(e) {
      //
    }
    return EventType[this.type()] + '(' + pathStr + ', ' + this.arg2() + ', '
      + this.arg3() + ')';
  }

  public run(replayer: EventReplay) {
    var type: EventType = this.type(), args: any[], lockCb: Function,
      arg1: number = this.arg1(), arg2: number = this.arg2(),
      arg3: number = this.arg3(), lockFd: number = -1, lockPaths: number[],
      methodName: string = EventType[type];

    /**
     * Handles locking the specified paths. Returns a CB to be passed to an
     * async function, *or* that should be called once a sync function finishes.
     */
    function handleLocking(lockFd: number, lockPaths: number[]): Function {
      var eventId = replayer.getCurrentEventId();
      if (lockFd > -1) {
        replayer.lockFd(lockFd);
      } else {
        // This will throw if any lock fails.
        replayer.lockPaths(lockPaths);
      }
      return (err, arg1) => {
        if (type === EventType.exists) {
          arg1 = err;
          err = undefined;
        }

        // if (err) console.log("Received error: " + err);

        if (lockFd > -1) {
          replayer.unlockFd(lockFd);
        } else {
          replayer.unlockPaths(lockPaths);
        }

        if (!err) {
          switch (type) {
            case EventType.open:
            case EventType.openSync:
              replayer.registerFd(eventId, arg1, lockPaths[0]);
              break;
            case EventType.close:
            case EventType.closeSync:
              replayer.unregisterFd(lockFd);
              break;
            default:
              break;
          }
        }
        // In case the replayer is paused... this will resume it. Or cause it to
        // try to resume, at least.
        replayer.ready();
        replayer.endEvent();
      };
    }

    // Lock resources and prepare arguments.
    switch (type) {
      /* (path) */
      case EventType.stat:
      case EventType.lstat:
      case EventType.unlink:
      case EventType.rmdir:
      case EventType.readdir:
      case EventType.exists:
      case EventType.statSync:
      case EventType.lstatSync:
      case EventType.unlinkSync:
      case EventType.rmdirSync:
      case EventType.readdirSync:
      case EventType.existsSync:
        args = [replayer.getString(arg1)];
        lockPaths = [arg1];
        break;
      /* (path, path) */
      case EventType.rename:
      case EventType.renameSync:
        args = [replayer.getString(arg1), replayer.getString(arg2)];
        lockPaths = [arg1, arg2];
        break;
      /* (fd, len) */
      case EventType.ftruncate:
      case EventType.ftruncateSync:
        args = [replayer.lookupFd(arg1), arg2];
        lockFd = arg1;
        break;
      /* (path, len) */
      case EventType.truncate:
      case EventType.truncateSync:
        args = [replayer.getString(arg1), arg2];
        lockPaths = [arg1];
        break;
      /* (fd) */
      case EventType.fstat:
      case EventType.fstatSync:
      case EventType.close:
      case EventType.closeSync:
      case EventType.fsync:
      case EventType.fstatSync:
        args = [replayer.lookupFd(arg1)];
        lockFd = arg1;
        break;
      /* (path, mode?) */
      case EventType.mkdir:
      case EventType.mkdirSync:
        lockPaths = [arg1];
        args = [replayer.getString(arg1)];
        if (arg2 > 0) args.push(arg2);
        break;
      /* (path flags mode?) */
      case EventType.open:
      case EventType.openSync:
        lockPaths = [arg1];
        args = [replayer.getString(arg1), flagEnum2String(arg2)];
        if (arg3 > 0) args.push(arg3);
        break;
      /* (fd buffer offset length position) */
      case EventType.read:
      case EventType.readSync:
      case EventType.write:
      case EventType.writeSync:
        lockFd = arg1;
        // XXX: We use max u32 as a null sentinel.
        if (arg3 === 4294967295) arg3 = null;
        args = [replayer.lookupFd(arg1), new Buffer(arg2), 0, arg2, arg3];
        break;
      /* (path buff options?) */
      case EventType.writeFile:
      case EventType.writeFileSync:
      case EventType.appendFile:
      case EventType.appendFileSync:
        // Convert from path, length, options
        lockPaths = [arg1];
        args = [replayer.getString(arg1), new Buffer(arg2)];
        if (arg3 > 0) {
          args.push(number2Options(arg3));
        }
        break;
      /* (path options?) */
      case EventType.readFile:
      case EventType.readFileSync:
        lockPaths = [arg1];
        args = [replayer.getString(arg1)];
        if (arg2 > 0) {
          args.push(number2Options(arg2));
        }
        break;
      default:
        console.log("Ignoring and forwarding event type: " + methodName);
        break;
    }
    lockCb = handleLocking(lockFd, lockPaths);
    if (methodName.indexOf('Sync') === -1) {
      // Asynchronous.
      args.push(lockCb);
    }
    // Call function with prepared arguments.
    var rv: any, err: any;
    try {
      rv = fs[methodName].apply(fs, args);
    } catch (e) {
      err = e;
    } finally {
      // Unlock resources for synchronous events.
      if (methodName.indexOf('Sync') !== -1) {
        lockCb(err, rv);
      }
    }
  }
}
