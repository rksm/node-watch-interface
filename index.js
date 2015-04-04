var path  = require("path");
var util  = require("util");
var watchUtil  = require("./lib/util");


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

function addChange(watchState, baseDirectory, type, fullFileName, stat) {
  log('change recorded: %s to %s -- %s', type, fullFileName, Date.now());
  var fileName = path.relative(baseDirectory, fullFileName);
  watchState.lastChange = Date.now()
  watchState.changeList.unshift({
    time: watchState.lastChange,
    path: fileName,
    type: type,
    stat: stat
  });
}

function withGazerFileNamesDo(gazer, dir, makeRelative, thenDo) {
  // returns array with file and dir names
  // gazerFiles like { '/foo/test-dir': [],
  //                   '/foo/test-dir/': [
  //                       '/foo/test-dir/a.txt',
  //                       '/foo/test-dir/b.txt'],
  gazer.watched(function(err, gazerFiles) {
    if (err) { thenDo(err, null); return; }
    var dirs = Object.getOwnPropertyNames(gazerFiles),
        makeRelativeFunc = relativePath.bind(null, dir);
    var files = uniq(dirs.reduce(function(files, key) {
      // ignore parent directories
      if (key.indexOf(dir) !== 0) return files;
      var filesInDir = gazerFiles[key].map(noLastSlash),
          dirName = noLastSlash(key);
      return files.concat([dirName]).concat(filesInDir)
    }, []));
    if (makeRelative) files = files.map(makeRelativeFunc);
    thenDo(null, files);
  });
}

// gazer event name -> our event name
var gazerEventTranslation = {
  added: 'creation',
  deleted: 'removal',
  changed: 'change'
}

function gazerIgnore(gazer, dir, excluded, thenDo) {
  withGazerFileNamesDo(gazer, dir, false, function(err, fileNames) {
    if (err) { console.error(String(err)); return; }
    fileNames
      .filter(ignore.bind(null, dir, excluded))
      .forEach(function(fn) { gazer.remove(fn); });
    thenDo && thenDo(null);
  });
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
function startWatching(watchState, dir, options, thenDo) {
  options = options || {}
  // var watchOptions = {
  //   ignoreDotFiles: options.ignoreDotFiles || false,
  //   filter: ignore.bind(null, dir, options.excludes || [])
  // }
  // setup to watch all files, ignores done via excludes (items can be strings
  // that should match the relative watched path, regexps, or functions)
  if (!require("fs").existsSync(dir)) {
    thenDo(new Error ('Requsted to watch directory '
                     + dir + ' but this directory does not exist!'));
    return;
  }

  var oldDir = process.cwd();
  process.chdir(dir);

  var watchPattern = options.files ? options.files : "**";

  try {
    gaze(watchPattern, function(err, gazer) {
      // 1. setup watch state
      var now = Date.now();
      util._extend(watchState, {
        startTime: now, lastChange: now,
        monitor: gazer,
        removeFileChangeListeners: function(thenDo) {
          log('File watcher on %s closing', dir);
          watchState.removeFileChangeListeners = function(cb) { cb && cb(); }
          gazer.on('end', function() {
            log('File watcher on %s closed', dir);
            thenDo && setTimeout(thenDo, 600);
          });
          gazer.close();
          watchState.monitor = null;
        }
      });

      // 2. register event listeners
      gazer.on('all'/*changed/added/deleted*/, function(evtType, filepath) {
        if (ignore(dir, options.excludes || [], filepath)) return;
        addChange(watchState, dir, gazerEventTranslation[evtType] || 'unknown', filepath, {});
      });
      gazer.on('ready', function(err) { log('READY?'); })
      gazer.on('error', function(err) {
        console.error('File watcher error on %s:\n%s', dir, err);
      });

      // 3. setup ignores
      setTimeout(function() {
        gazerIgnore(gazer, dir, options.excludes || []);
        setTimeout(thenDo.bind(null, null, watchState), 1000);
      }, 300);
    });
  } catch (e) { thenDo(e); } finally { process.chdir(oldDir); }
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

function makeMonitorFilesRelative(baseDirectory, fullPaths) {
    return fullPaths.map(function(fullPath) {
      var rel = path.relative(baseDirectory, fullPath);
      if (rel === '') rel = '.';
      return rel;
    });
}

function getWatchedFiles(watchState, dir, options, thenDo) {
  ensureWatchState(watchState, dir, options, function(err, watchState) {
    withGazerFileNamesDo(watchState.monitor, dir, true, function(err, fileNames) {
        thenDo(err, fileNames, watchState);
    });
  });
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
var watchStates = module.exports.watchStates = {/*dir -> watchstate*/}

module.exports.on = function(directory, options, thenDo) {
  getWatchedFiles(watchStates[directory], directory, options, function(err, fileSpec, watchState) {
    watchStates[directory] = watchState;
    var watcher = {
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
    }
    thenDo(err, watcher);
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
