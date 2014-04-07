import event_logger = require('./event_logger');
import fs = require('fs');
import path = require('path');

declare var BrowserFS;
declare var InMemoryCache;
declare var results;
declare var setImmediate: (cb: Function) => void;
BrowserFS.install(window);
window['results'] = {};

var backends: string[] = ['idbfs'],
  cache_configs: { [name: string]: () => any } = {
    'none': function() {
      return undefined;
    }, 'unlimited': function() {
      return new InMemoryCache(60*1024*1024);
    }, '5mb': function () {
      return new InMemoryCache(5*1024*1024);
    }, '1mb': function() {
      return new InMemoryCache(1*1024*1024);
    }
  },
  replays: number = 4,
  benchmarks: { [name: string]: string[] } = {
    'bananabread': ['bananabread_arena', 'bananabread_lavarooms']
    //'latex': ['latex_stabilizer', 'latex_stabilizer']
  }, idbfs: any;

function write_file(src: string, dest: string, cb: Function) {
  fs.exists(src, (val) => {
    if (val) cb();
    else {
      fs.readFile(src, (e, data: NodeBuffer) => {
        if (e) throw e;
        fs.writeFile(dest, data, (e) => {
          if (e) throw e;
          cb();
        });
      });
    }
  });
}

/**
 * Copy contents of src into dest.
 * Dest must exist.
 */
function write_directory(src: string, dest: string, cb: Function) {
  fs.readdir(src, (e, contents: string[]) => {
    var i: number, semaphore: number = contents.length;
    if (e) throw e;
    for (i = 0; i < contents.length; i++) {
      write_path(path.join(src, contents[i]), path.join(dest, contents[i]), () => {
        if (--semaphore === 0) cb();
      });
    }
  });
}

function write_path(src: string, dest: string, cb: Function) {
  fs.stat(src, (e, stats: fs.Stats) => {
    if (stats.isDirectory()) {
      fs.exists(dest, (val) => {
        if (val) write_directory(src, dest, cb);
        else {
          fs.mkdir(dest, (e?) => {
            if (e) throw e;
            write_directory(src, dest, cb);
          });
        }
      });
    } else {
      write_file(src, dest, cb);
    }
  });
}

/**
 * Called when the backend should be preloaded with all of the files.
 * Returns nothing.
 */
function preload_backend(type: string, benchmark: string, cb: Function): void {
  switch(type) {
    case 'xhrfs':
      // NOP.
      setImmediate(cb);
      break;
    case 'idbfs':
      new BrowserFS.FileSystem.IndexedDB((e, fs) => {
        if (e) throw e;
        idbfs = fs;

        var mfs = new BrowserFS.FileSystem.MountableFileSystem();
        mfs.mount('/xhrfs', new BrowserFS.FileSystem.XmlHttpRequest('./listings.json', '.'));
        mfs.mount('/idbfs', idbfs);
        BrowserFS.initialize(mfs);
        write_path('/xhrfs/' + benchmark, '/idbfs/' + benchmark, () => {
          cb();
        });
      }, 'benchmark');
      break;
    default:
      throw new Error("Invalid backend: " + type);
  }
}

/**
 * Called to retrieve an instantiation of the given backend for the given
 * configuration.
 */
function instantiate_backend(type: string, cache: any, cb: Function): void {
  switch(type) {
    case 'xhrfs':
      setImmediate(() => {
        cb(new BrowserFS.FileSystem.XmlHttpRequest('./listings.json', '.', cache));
      });
      return;
    case 'idbfs':
      setImmediate(() => {
        if (cache != null) idbfs.resetCache(cache);
        cb(idbfs);
      });
      return;
    default:
      throw new Error('Unrecognized backend: ' + type);
  }
}

function run_benchmark_config(backend_type: string, name: string, configs: string[], cache_name: string, cache: any, cb: Function) {
  var time: number = 0, onConfig: number = 0, onReplay: number = 0;
  results[backend_type][name][cache_name] = [];

  function next_config(cb: Function) {
    if (onConfig === configs.length) {
      console.log(backend_type + ' ' + name + ' ' + cache_name + ' ' + time + ' [' + (cache != null ? cache.hitRate() : 0) + ']');
      results[backend_type][name][cache_name].push((cache != null ? cache.hitRate() : 0), time);
      time = 0;
      setImmediate(cb);
    } else {
      var nextConfig: string = configs[onConfig];
      onConfig++;
      new event_logger.EventReplay(nextConfig, function (t2) {
        time += t2;
        setImmediate(() => { next_config(cb); });
      });
    }
  }

  function next_replay() {
    if (onReplay === replays) {
      setImmediate(cb);
    } else {
      onReplay++;
      onConfig = 0;
      next_config(next_replay);
    }
  }

  instantiate_backend(backend_type, cache, (backend) => {
    BrowserFS.initialize(backend);
    next_replay();
  });
}

function run_benchmark(backend_type: string, name: string, configs: string[], cb: Function) {
  var cacheNames: string[] = Object.keys(cache_configs),
    onCache: number = 0;
  results[backend_type][name] = {};
  preload_backend(backend_type, name, () => {
    process.chdir(name);
    // Iterate through cache types!
    function next_cache() {
      if (onCache === cacheNames.length) {
        process.chdir('..');
        setImmediate(cb);
      } else {
        var cacheName: string = cacheNames[onCache];
        onCache++;
        run_benchmark_config(backend_type, name, configs, cacheName, cache_configs[cacheName](), next_cache);
      }
    }
    next_cache();
  });
}

function run_backend(backend_type: string, cb: Function) {
  results[backend_type] = {};
  // Perform each benchmark!
  var benchmarkNames: string[] =  Object.keys(benchmarks),
    onBenchmark: number = 0;

  function next_benchmark() {
    if (onBenchmark === benchmarkNames.length) {
      setImmediate(cb);
    } else {
      var benchmarkName = benchmarkNames[onBenchmark];
      onBenchmark++;
      run_benchmark(backend_type, benchmarkName, benchmarks[benchmarkName], next_benchmark);
    }
  }
  next_benchmark();
}

var onBackend: number = 0;
function next_backend() {
  if (onBackend === backends.length) {
    alert("FINISHED!");
  } else {
    var backend: string = backends[onBackend];
    onBackend++;
    run_backend(backend, next_backend);
  }
}

// KICK OFF!
next_backend();
