# file-watcher

Recursively gather file meta data starting at a root directory. When files
change the meta data gets automatically updated. It is thin wrapper for 'watch'
that takes care of file meta object housekeeping.

## Usage

### `startWatching(directory, options)`

- `directory`: String
- `options`: Object with
  - `ignoreDotFiles`: Bool, whether to filter out files and directories starting with a `.`
  - `exclude`: Array of strings, regular expressions or functions that should
    match if the particular file should be ignored. Example: `[...]`
- returns watcher object

### watcher object `getWatchedFiles(callback)`

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

### watcher object `getChangesSince(timestamp, callback)`

- timestamp: Request changes since. Date object or Number specifying a data. If null, returns all changes observed.
- callback is called with two args: `err` and `{changes: {time,path,type,stat}}` with type one of `['removal', 'creation', 'change']`

## License

[MIT](LICENSE)