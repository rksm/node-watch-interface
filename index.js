var path      = require("path");
var fs        = require("fs");
var util      = require("util");
var lang      = require("lively.lang");
var chokidar  = require("chokidar");
var watchUtil = require("./lib/util");

var log = watchUtil.log;
log.debug = true;

var relativePath = watchUtil.relativePath;
var noLastSlash = watchUtil.noLastSlash;
var uniq = watchUtil.uniq;

function ignore(baseDirectory, ignoredItems, fullName) {
  // fullPath is String, absolute path to file or directory
  var relPath = path.relative(baseDirectory, fullName);
  for (var i = 0; i < ignoredItems.length; i++) {
    var ign = ignoredItems[i];
    if (typeof ign === 'string' && relPath === ign) return true;
    if (typeof ign === 'function' && ign(relPath)) return true;
    if (util.isRegExp(ign) && relPath.match(ign)) return true;
  }
  return false;
}

function addChange(options, watchState, baseDirectory, type, fullFileName, stat) {
  log('change recorded: %s to %s -- %s', type, fullFileName, Date.now());
  var fileName = path.relative(baseDirectory, fullFileName);
  if (options.files && options.files.indexOf(fileName) === -1) return;
  watchState.lastChange = Date.now();
  watchState.changeList.unshift({
    time: watchState.lastChange,
    path: fileName,
    type: type,
    stat: stat
  });
}

function withChokidarFileNamesDo(chokidar, baseDir, makeRelative, thenDo) {
  // returns array with file and dir names
  // gazerFiles like { '/foo/test-dir': [],
  //                   '/foo/test-dir/': [
  //                       '/foo/test-dir/a.txt',
  //                       '/foo/test-dir/b.txt'],

  baseDir = watchUtil.noLastSlash(path.normalize(baseDir));

  var files = Object.keys(chokidar._watched)
    .map(watchUtil.noLastSlash)
    .filter(function(ea) { return baseDir.indexOf(ea) === -1 || (baseDir.indexOf(ea) === 0 && ea.length >= baseDir.length); })
    .reduce(function(all, dir) {
      return all.concat(chokidar._watched[dir].children()
        .map(function(ea) { return path.join(dir, ea); })
        .concat([dir + "/"]))
    }, []);

  // remove directories that are included without slash
  var dirsNoSlash = files
    .filter(function(ea) { return ea[ea.length-1] === "/"; })
    .map(function(ea) { return ea.slice(0, -1); })

  var normalized = files
    .filter(function(ea) { return dirsNoSlash.indexOf(ea) === -1; })
    .sort();

  if (makeRelative) normalized = normalized.map(relativePath.bind(null, baseDir));
  thenDo(null, normalized);
}

function chokidarIgnore(watcher, dir, excluded, thenDo) {
  withChokidarFileNamesDo(watcher, dir, false, function(err, filenames) {
    if (err) { console.error(String(err)); return thenDo(err); }
    filenames
      .filter(ignore.bind(null, dir, excluded))
      .forEach(function(fn) { watcher.unwatch(fn); });
    thenDo && thenDo(null);
  });
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
function startWatching(watchState, dir, options, thenDo) {
  options = options || {}
  // var watchOptions = {
  //   ignoreDotFiles: options.ignoreDotFiles || false,
  //   excludes: [....]
  // }
  // setup to watch all files, ignores done via excludes (items can be strings
  // that should match the relative watched path, regexps, or functions)
  if (!fs.existsSync(dir)) {
    thenDo(new Error ('Requested to watch directory '
                     + dir + ' but this directory does not exist!'));
    return;
  }

  thenDo = lang.fun.once(thenDo || function() {});

  try {

    var watcher = chokidar.watch(dir, {
      persistent: true,
      ignored: function(path) { return ignore(dir, options.excludes || [], path); }
    });

    // if (options.files) watcher.add(options.files);

    watcher
      .on('error', function(error) { console.error('File watcher error on %s:\n%s', dir, error); })
      .on('ready', function() {

        watcher
          .on('change',    function(path, stats) { addChange(options, watchState, dir, "change", path, stats); })
          .on('add',       function(path, stats) { addChange(options, watchState, dir, "creation", path, stats); })
          .on('addDir',    function(path, stats) { addChange(options, watchState, dir, "creation", path, stats); })
          .on('unlink',    function(path) { addChange(options, watchState, dir, "removal", path, {}); })
          .on('unlinkDir', function(path) { addChange(options, watchState, dir, "removal", path, {}); });

        log('READY');

        // 1. setup watch state
        var now = Date.now();
        util._extend(watchState, {
          startTime: now, lastChange: now,
          monitor: watcher,
          removeFileChangeListeners: function(thenDo) {
            log('File watcher on %s closing', dir);
            watchState.removeFileChangeListeners = function(cb) { cb && cb(); }
            try {
              watcher.close();
              watchState.monitor = null;
              thenDo && setTimeout(thenDo, 100);
            } catch (e) {
              console.error(e);
              thenDo && thenDo(e);
            }
          }
        });

        // 2. setup ignores
        lang.fun.composeAsync(
          function(n) { setTimeout(n, 100); },
          function(n) { chokidarIgnore(watcher, dir, options.excludes || [], n); },
          function(n) { setTimeout(n, 100); }
        )(function(err) { thenDo(err, watchState); });
      });

  } catch (e) { thenDo(e); }
}

function createWatchState() {
  return {
    monitor: null,
    lastChange: null,
    startTime: null,
    changeList: [],
    removeFileChangeListeners: function(thenDo) { thenDo && thenDo(null); }
  };
}

function ensureWatchState(watchState, dir, options, thenDo) {
  if (!watchState) watchState = createWatchState();
  if (!watchState.monitor) startWatching(watchState, dir, options, thenDo)
  else thenDo(null, watchState)
}

function getChangesSince(watchState, dir, options, timestampSince, timestampStart, thenDo) {
  timestampSince = timestampSince || 0;
  ensureWatchState(watchState, dir, options, function(err, watchState) {
    if (!err && timestampStart && timestampStart !== watchState.startTime) {
      err = {error: 'Start time does not match! ' + timestampStart + ' vs ' +  watchState.startTime};
    }
    if (err) { thenDo(err, []); return; }
    var changes = watchState.changeList, result = [];
    for (var i = 0; i < changes.length; i++) {
      if (changes[i].time > timestampSince) { result.push(changes[i]); continue; }
      break;
    }
    thenDo(err, result, watchState);
  });
}

function getWatchedFiles(watchState, dir, options, thenDo) {
  ensureWatchState(watchState, dir, options, function(err, watchState) {
    withChokidarFileNamesDo(watchState.monitor, dir, true, function(err, fileNames) {
        thenDo(err, fileNames, watchState);
    });
  });
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
var watchStates = module.exports.watchStates = {/*dir -> watchstate*/}

module.exports.on = function(directory, options, thenDo) {
  getWatchedFiles(watchStates[directory], directory, options, function(err, fileSpec, watchState) {
    watchStates[directory] = watchState;
    util._extend(watchState, {
      state: watchState,
      getWatchedFiles: function(callback) {
        getWatchedFiles(watchState, directory, options, callback);
      },
      getChangesSince: function(since, callback) {
        getChangesSince(watchState, directory, options, since, watchState.startTime, callback);
      },
      close: function(thenDo) {
        delete watchStates[directory];
        watchState.removeFileChangeListeners(thenDo);
      }
    })
    thenDo(err, watchState);
  });
}

module.exports.onFiles = function(directory, files, options, thenDo) {
  // FIXME this implementation is just a hack: First we start watchign the
  // entire directory, then we remove all files that aren't in files.
  // It would be better to directly use the gaze interface to start watching
  // only on the given files
  options = options || {};
  options.files = files;
  module.exports.on(directory, options, thenDo);
}

module.exports.watchStates = watchStates;
