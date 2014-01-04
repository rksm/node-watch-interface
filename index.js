var path = require("path");
var util = require("util");
var watch = require("watch");
// var domain = require('domain');
// var dirWatcherDomain = domain.create();

// dirWatcherDomain.on('error', function(er) {
//   console.error('DirectoryWatchServer error %s\n%s©', er, er.stack);
// });

var watchState = {};

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

function addChange(baseDirectory, changeRecord, type, fullFileName, stat) {
      console.log('change recorded: %s to %s -- %s', type, fullFileName, Date.now());
  var fileName = path.relative(baseDirectory, fullFileName);
  changeRecord.lastChange = Date.now()
  changeRecord.changeList.unshift({
    time: changeRecord.lastChange,
    path: fileName,
    type: type,
    stat: stat
  });
}

function startWatching(dir, options, thenDo) {
  options = options || {}
  var watchOptions = {
      ignoreDotFiles: options.ignoreDotFiles || false,
      filter: ignore.bind(null, dir, options.excludes || [])
    },
    changes = watchState[dir] = {
      monitor: null,
      lastChange: null,
      startTime: null,
      changeList: []
    };
  if (!watch) { thenDo({error: 'watch not available!'}, changes); return changes; }
  watch.createMonitor(dir, watchOptions, function (monitor) {
    changes.startTime = changes.lastChange = Date.now();
    changes.monitor = monitor;
    monitor.on("created", function (f, stat) { addChange(dir, changes, 'creation', f, stat); });
    monitor.on("changed", function (f, curr, prev) { addChange(dir, changes, 'change', f, curr); })
    monitor.on("removed", function (f, stat) { addChange(dir, changes, 'removal', f); })
    thenDo(null, changes);
  });
  return changes;
}

function ensureWatchState(dir, options, thenDo) {
  if (watchState[dir]) thenDo(null, watchState[dir])
  else startWatching(dir, options, thenDo);
}

function getChangesSince(dir, options, timestampSince, timestampStart, thenDo) {
  timestampSince = timestampSince || 0;
  ensureWatchState(dir, options, function(err, watchState) {
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

function getWatchedFiles(dir, options, thenDo) {
  if (!watch) { thenDo({error: 'watch not available'}, {}, null); return; }
  ensureWatchState(dir, options, function(err, watchState) {
    thenDo(err, makeMonitorFilesRelative(dir, watchState.monitor),
      watchState && watchState.startTime,
      watchState.monitor);
  });
}

function close(dir, thenDo) {
  // w.monitor.removeAllListeners(type)
}

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// todo isolate watch state
module.exports.on = function(directory, options, thenDo) {
  getWatchedFiles(directory, options, function(err, watchState, startTime, monitor) {
    var watcher = {
      startTime: startTime,
      monitor: monitor,
      getWatchedFiles: function(callback) {
        getWatchedFiles(directory, options, callback);
      },
      getChangesSince: function(since, callback) {
        getChangesSince(directory, options, since, startTime, callback);
      },
      close: function(thenDo) {
        monitor.removeAllListeners("created");
        monitor.removeAllListeners("changed");
        monitor.removeAllListeners("removed");
        thenDo && thenDo(null);
      }
    }
    thenDo(err, watcher);
  });
}
