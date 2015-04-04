/*global require,__dirname,setTimeout*/

var path          = require("path"),
    fs            = require("fs"),
    async         = require("async"),
    fsHelper      = require("lively-fs-helper"),
    fileWatcher   = require("../index"),
    baseDirectory = __dirname,
    testDirectory = path.join(baseDirectory, "testDir/"),
                    currentWatcher;

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// debugging
function logProgress(msg) {
  return function(thenDo) { console.log(msg); thenDo && thenDo(); }
}

function await(ms) { return function(next) { setTimeout(next, ms); }; }

function assertAllIncluded(test, array1, array2, msg) {
  msg = msg || '';
  var failed = false;
  for (var i = 0; i < array1.length; i++) {
    var item = array1[i];
    if (-1 === array2.indexOf(item)) {
      test.ok(false, 'item ' + i + ' = ' + item + ' of first array not in second. ' + msg);
      return;
    }
  }
  for (var i = 0; i < array2.length; i++) {
    var item = array2[i];
    if (-1 === array2.indexOf(item)) {
      test.ok(false, 'item ' + i + ' = ' + item + ' of second array not in first. ' + msg);
      return;
    }
  }
  if (!failed) test.ok('all included');
}
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// tests
var tests = {

  setUp: function (callback) {
    async.series([
      function(next) {
        var files = {
          "testDir": {
            "file1.js": "// file1 content\nfoo + bar + baz",
            "file2.js": "// file2 content\ntest test test\n\n\n\n",
              "some-folder": {
                "file3.js": "// file3 content\ntest test more test",
                "file4.js": "// file4 content\ntest test test more test"
              }
          }
        };
        fsHelper.createDirStructure(baseDirectory, files, next);
      },
      logProgress('test files created')
    ], callback);
  },

  tearDown: function (callback) {
    async.series([
      function(next) {
        if (currentWatcher) currentWatcher.close(next);
        else next();
      },
      fsHelper.cleanupTempFiles
    ], callback);
  },

  testDumb: function(test) {
    setTimeout(function() {
      fileWatcher.on(".", {}, function(err, watcher) {
        currentWatcher = watcher;
        test.done();
      });
    }, 100);
  },

  testStartWatchingAndRetrieveFileInfos: function(test) {
    fileWatcher.on(testDirectory, {excludes: ["some-folder/file3.js"]}, function(err, watcher) {
      currentWatcher = watcher;
      test.ifError(err);
      watcher.getWatchedFiles(function(err, files, startTime) {
        var expected = ['file1.js', 'file2.js','some-folder', 'some-folder/file4.js', '.'];
        assertAllIncluded(test, expected, files);
        test.done();
      });
    });
  },

  testChangesAreDiscovered: function(test) {
    // this test checks if file changes are automatically observed. Since the
    // watcher has a rather coarse granularity we have to wait for several seconds
    var startTime = Date.now(),
        timeout = 3*1000, lastChangeBefore;
    async.series([
      function(next) {
        fileWatcher.on(testDirectory, {excludes: ["some-folder/file3.js"]}, function(err, w) {
          test.ifError(err);
          lastChangeBefore = w.state.lastChange;
          currentWatcher = w; next();
        });
      },
      await(200),
      function(next) { fs.writeFile(path.join(testDirectory, 'file1.js'), 'fooooo', next); },
      function waitForChange(next) {
        currentWatcher.getChangesSince(startTime, function(err, changes, watchState) {
          if /*timeout*/(Date.now()-startTime > timeout) { test.ok(false, 'timeout when waiting for file changes to be found'); test.done(); }
          else if /*no changes yet*/(!changes.length && !err) { console.log('waiting....'); setTimeout(waitForChange.bind(null, next), 200); }
          else {
            test.ifError(err);
            test.ok(watchState.lastChange > lastChangeBefore, 'modification not picked up?');
            test.equals(changes.length, 1, 'more then one change');
            test.equals(changes[0].path, 'file1.js', 'path');
            test.equals(changes[0].type, 'change', 'type');
            next();
          }
        });
      }
    ], test.done);
  },

  testRemoval: function(test) {
    var startTime = Date.now(), timeout = 3*1000;
    async.series([
      function(next) {
        fileWatcher.on(testDirectory, {excludes: ["some-folder/file3.js"]}, function(err, w) {
          test.ifError(err); currentWatcher = w; next();
        });
      },

      function(next) { setTimeout(next, 200); },
      function(next) { fs.unlink(path.join(testDirectory, 'file1.js'), next); },

      function waitForChange(next) {
        currentWatcher.getChangesSince(startTime, function(err, changes, watchState) {
          if /*timeout*/(Date.now()-startTime > timeout) { test.ok(false, 'timeout when waiting for file changes to be found'); test.done(); }
          else if /*no changes yet*/(!changes.length && !err) { console.log('waiting....'); setTimeout(waitForChange.bind(null, next), 200); }
          else {
            test.ifError(err);
            test.equals(changes.length, 1, 'more then one change');
            test.equals(changes[0].path, 'file1.js', 'path');
            test.equals(changes[0].type, 'removal', 'type');
            next();
          }
        });
      },

      function(next) {
        currentWatcher.getWatchedFiles(function(err, files, watchState) {
          test.ifError(err);
          var expected = ['file2.js','some-folder', 'some-folder/file4.js', '.'];
          assertAllIncluded(test, expected, files);
          next();
        });
      }
    ], test.done);
  },

  testCreation: function(test) {
    var startTime = Date.now(), timeout = 30*1000;
    async.series([
      function(next) {
        fileWatcher.on(testDirectory, {excludes: ["some-folder/file3.js"]}, function(err, w) {
          test.ifError(err); currentWatcher = w; next();
        });
      },
      await(200),
      function(next) { fs.writeFile(path.join(testDirectory, 'newFile.txt'), 'fooo', next); },
      function waitForChange(next) {
        currentWatcher.getChangesSince(startTime, function(err, changes, watchState) {
          if /*timeout*/(Date.now()-startTime > timeout) { test.ok(false, 'timeout when waiting for file changes to be found'); test.done(); }
          else if /*no changes yet*/(!changes.length && !err) { console.log('waiting....'); setTimeout(waitForChange.bind(null, next), 200); }
          else {
            test.ifError(err);
            test.equals(changes.length, 1, 'more then one change');
            test.equals(changes[0].path, 'newFile.txt', 'path');
            test.equals(changes[0].type, 'creation', 'type');
            next();
          }
        });
      },
      function(next) {
        currentWatcher.getWatchedFiles(function(err, files, watchState) {
          test.ifError(err);
          var expected = ['newFile.txt', 'file1.js', 'file2.js','some-folder', 'some-folder/file4.js', '.'];
          assertAllIncluded(test, expected, files);
          next();
        });
      }
    ], test.done);
  },

  testJustWatchFiles: function(test) {
    var startTime = Date.now(), timeout = 30*1000;
    async.series([
      function(next) {
        fileWatcher.onFiles(testDirectory, ["file1.js", "some-folder/file3.js"], {}, function(err, w) {
          test.ifError(err); currentWatcher = w; next(); });
      },
      await(100),

      // 1. ignore changes to non watched files
      function(next) { fs.writeFile(path.join(testDirectory, 'file2.js'), 'fooo', next); },
      await(300),
      function waitForChange(next) {
        currentWatcher.getChangesSince(startTime, function(err, changes, watchState) {
          test.ifError(err);
          var nonCreationChanges = changes.filter(function(ea) { return ea.type !== "creation"; });
          test.equals(nonCreationChanges.length, 0, 'change to non watched file observed?');
          next();
        });
      },

      // 2. Changes to watched files should be picked up
      function(next) { fs.writeFile(path.join(testDirectory, 'file1.js'), 'fooo', next); },
      await(300),
      function waitForChange(next) {
        currentWatcher.getChangesSince(startTime, function(err, changes, watchState) {
          test.ifError(err);
          var nonCreationChanges = changes.filter(function(ea) { return ea.type !== "creation"; });
          test.equals(nonCreationChanges.length, 1, 'change to watched file not observed?');
          next();
        });
      },

      // 3. Newly added files should be ignored
      function(next) { fs.writeFile(path.join(testDirectory, 'file3.js'), 'fooo', next); },
      await(300),
      function waitForChange(next) {
        currentWatcher.getChangesSince(startTime, function(err, changes, watchState) {
          test.ifError(err);
          var nonCreationChanges = changes.filter(function(ea) { return ea.type !== "creation"; });
          test.equals(nonCreationChanges.length, 1, 'change of newly added file not ignored?');
          next();
        });
      }

    ], test.done);

  }

};

module.exports = tests;
