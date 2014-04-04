{
    name: '../lib/almond/almond',
    baseurl: '.',
    include: ['loggingfs'],
    paths: {
        fs: '../tools/fs',
        path: '../tools/path',
        assert: '../tools/assert',
        buffer: '../tools/buffer'
    },
    out: 'lfs-build.js',
    optimize: 'none',
    wrap: {
        start: "(function() {",
        end: "self.loggingfs = require('loggingfs');}());"
    },
}
