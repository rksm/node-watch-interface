# watch-interface

Recursively gather file meta data starting at a root directory. When files
change the meta data gets automatically updated. It is thin wrapper for [gaze](https://github.com/shama/gaze)
that takes care of some housekeeping and provides a non-changing interface when
we change the watching backend.

## Usage

### `require('watch-interface').on(directory, options, callback)`

Starts watching a directory recursively.

- `directory`: String, root of what should be watched
- `options`: Object with
  - `exclude`: Array of strings, regular expressions or functions that should
    match if the particular file should be ignored.
- `callback`: gets err object and a `gazer`

### `gazer.state`

- object with the fields
  - `monitor`: gazer object from the `gaze` module
  - `lastChange`: Date
  - `startTime`: Date
  - `changeList`: list of changes accrued since `startTime`, having the fields:
      - `time`
      - `path`
      - `type`: one of `["creation", "removal", "change"]`

### `gazer.getWatchedFiles(callback)`

Retrieve all the files being watched.

- `callback` is called with an error object and and array of files (file paths,
  relative to the base directory being watched)

### `gazer.getChangesSince(date, callback)`

Retrieve what changes happened since a given time.

- `date`: Request changes since. Date object or Number specifying a data. If null, returns all changes observed.
- `callback` is called with two args: `err` and `[{time,path,type}]` with type one of `['removal', 'creation', 'change']`

### `gazer.close(callback)`

Stop watching.

- `callback`: gets err argument.

## License

[MIT](LICENSE)