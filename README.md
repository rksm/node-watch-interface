# watch-interface

Recursively gather file meta data starting at a root directory. When files
change the meta data gets automatically updated. It is thin wrapper for 'watch'
that takes care of file meta object housekeeping.

The motivation for creating this project is to have an interface that wraps
mikeal's watch module which works fine but depends on the deperecated
`fs.watchFile` API and is slow. Once `fs.watch` becomes more stable I'll switch
to base this module on the new interface. Code depending on this module will
hopefully not have to change.

## Usage

### `require('watch-interface').on(directory, options, callback)`

Starts watching a directory recursively.

- `directory`: String, root of what should be watched
- `options`: Object with
  - `ignoreDotFiles`: Bool, whether to filter out files and directories starting with a `.`
  - `exclude`: Array of strings, regular expressions or functions that should
    match if the particular file should be ignored.
- `callback`: gets err object and a `watcher`

### `watcher.state`

- object with the fields
  - `monitor`: monitor object from the watch module
  - `lastChange`: Date
  - `startTime`: Date
  - `changeList`: list of changes accrued since `startTime`

### `watcher.getWatchedFiles(callback)`

Retrieve all the files being watched.

- `callback` is called with an error object and `{files: {PATHSTRING: FILESTAT}, startTime: NUMBER}`
  - file stat is stat object used by node.js fs with fields
    - dev
    - mode
    - nlink
    - uid
    - gid
    - rdev
    - blksize
    - ino
    - size
    - blocks
    - atime
    - mtime
    - ctime

### `watcher.getChangesSince(date, callback)`

Retrieve what changes happened since a given time.

- `date`: Request changes since. Date object or Number specifying a data. If null, returns all changes observed.
- `callback` is called with two args: `err` and `[{time,path,type,stat}]` with type one of `['removal', 'creation', 'change']`

### `watcher.close(callback)`

Stop watching.

- `callback`: gets err argument.

## License

[MIT](LICENSE)