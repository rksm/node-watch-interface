var path          = require("path"),
    fs            = require("fs"),
    async         = require("async"),
    fsHelper      = require("lively-fs-helper"),
    fileWatcher   = require("../index"),
    baseDirectory = __dirname,
    testDirectory = path.join(baseDirectory, "testDir"),
                    currentWatcher;

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// debugging
function logProgress(msg) {
  return function(thenDo) { console.log(msg); thenDo && thenDo(); }
}

function assertAllIncluded(test, array1, array2, msg) {
  msg = msg || '';
  var failed = false;
  for (var i = 0; i < array1.length; i++) {
    var item = array1[i];
    if (-1 === array2.indexOf(item)) {
      failed = true;
      test.ok(false, 'item ' + i + ' of first array not in second. ' + msg);
    }
  }
  for (var i = 0; i < array2.length; i++) {
    var item = array2[i];
    if (-1 === array2.indexOf(item)) {
      failed = true;
      test.ok(false, 'item ' + i + ' of second array not in first. ' + msg);
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

  testStartWatchingAndRetrieveFileInfos: function(test) {
    fileWatcher.on(testDirectory, {excludes: ["file3.js"]}, function(err, watcher) {
      currentWatcher = watcher;
      test.ifError(err);
      watcher.getWatchedFiles(function(err, fileInfos, startTime) {
        var files = Object.keys(fileInfos),
            expected = ['file1.js', 'file2.js','some-folder', 'some-folder/file4.js', '.'];
        assertAllIncluded(test, expected, files);
        test.done();
      });
    });
  },

  testChangesAreDiscovered: function(test) {
    // this test checks if file changes are automatically observed. Since the
    // watcher has a rather coarse granularity we have to wait for several seconds
    var startTime = Date.now(),
        timeout = 30*1000, changes;
    async.series([
      function(next) {
        fileWatcher.on(testDirectory, {excludes: ["file3.js"]}, function(err, w) {
          test.ifError(err); currentWatcher = w; next();
        });
      },
      function(next) { setTimeout(next, 1000); },
      function(next) { fs.writeFile(path.join(testDirectory, 'file1.js'), 'fooooo', next); },
      function waitForChange(next) {
        currentWatcher.getChangesSince(startTime, function(err, c, _) {
          changes = c;
          if (Date.now()-startTime > timeout) {
            test.ok(false, 'timeout when waiting for file changes to be found');
            test.done();
          } else if (!changes.length && !err) {
            console.log('waiting....');
            setTimeout(waitForChange.bind(null, next), 1000);
          } else { test.ifError(err); next(); }
        });
      },
      function(next) {
        currentWatcher.getWatchedFiles(function(err, fileInfos, watchState) {
          test.ok(fileInfos["file2.js"].mtime < startTime, 'unmodified file has newer mod date?');
          test.ok(fileInfos["file1.js"].mtime > startTime, 'modification not picked up?');
          next();
        });
      }
    ], test.done);
  }

};

module.exports = tests;
