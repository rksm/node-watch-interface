var path  = require("path");
var util  = require("util");
var watch = require("watch");

var debug = true;

function log(/*args*/) {
  if (debug) console.log.apply(console, arguments);
}

function ignore(baseDirectory, ignoredItems, fullPath) {
  // fullPath is String, absolute path to file or directory
  var fn = path.relative(baseDirectory, fullPath);
  for (var i = 0; i < ignoredItems.length; i++) {
    var ign = ignoredItems[i];
    if (typeof ign === 'string' && fn === ign) return true;
    if (typeof ign === 'function' && ign(fn)) return true;
    if (util.isRegExp(ign) && fn.match(ign)) return true;
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

function startWatching(watchState, dir, options, thenDo) {
  options = options || {}
  var watchOptions = {
    ignoreDotFiles: options.ignoreDotFiles || false,
    filter: ignore.bind(null, dir, options.excludes || [])
  }
  watch.createMonitor(dir, watchOptions, function (monitor) {
    watchState.startTime = watchState.lastChange = Date.now();
    watchState.monitor = monitor;
    function creationListener(f, stat) { addChange(watchState, dir, 'creation', f, stat); }
    function changeListener(f, curr, prev) { addChange(watchState, dir, 'change', f, curr); }
    function removalListener(f, stat) { addChange(watchState, dir, 'removal', f); }
    monitor.on("created", creationListener);
    monitor.on("changed", changeListener);
    monitor.on("removed", removalListener);
    watchState.removeFileChangeListeners = function(thenDo) {
        monitor.removeListener("created", creationListener);
        monitor.removeListener("changed", changeListener);
        monitor.removeListener("removed", removalListener);
        watchState.removeFileChangeListeners = function(thenDo) { thenDo && thenDo(null); };
        thenDo && thenDo(null);
    }
    thenDo(null, watchState);
  });
  return watchState;
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
    thenDo(err, result, watchState.startTime);
  });
}

function makeMonitorFilesRelative(baseDirectory, monitor) {
    var fileObj = (monitor && monitor.files) || {},
        relativeFileObj = {};
    Object.getOwnPropertyNames(fileObj).forEach(function(fullPath) {
      relativeFileObj[path.relative(baseDirectory, fullPath)] = fileObj[fullPath]; });
    if (relativeFileObj['']) {
      relativeFileObj['.'] = relativeFileObj[''];
      delete relativeFileObj[''];
    }
    return relativeFileObj;
}

function getWatchedFiles(watchState, dir, options, thenDo) {
  if (!watch) { thenDo({error: 'watch not available'}, {}, null); return; }
  ensureWatchState(watchState, dir, options, function(err, watchState) {
    thenDo(err, makeMonitorFilesRelative(dir, watchState.monitor), watchState);
  });
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
var watchStates = module.exports.watchStates = {/*dir -> watchstate*/}

module.exports.on = function(directory, options, thenDo) {
  getWatchedFiles(watchStates[directory], directory, options, function(err, fileSpec, watchState) {
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
