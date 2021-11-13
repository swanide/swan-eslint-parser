import resolve from 'rollup-plugin-node-resolve';
import sourcemaps from 'rollup-plugin-sourcemaps';
import cleanup from 'rollup-plugin-cleanup';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('./package.json');

const deps = new Set(
    ['assert', 'events', 'path'].concat(Object.keys(pkg.dependencies))
);

export default {
    input: '.temp/index.js',
    output: {
        file: 'index.js',
        format: 'cjs',
        sourcemap: false,
        sourcemapFile: 'index.js.map',
        banner: `/**
 * @author kekee000@gmail.com
 * See LICENSE file in root directory for full license.
 */`,
    },
    plugins: [sourcemaps(), resolve(), cleanup({comments: 'none'})],
    external: id => deps.has(id) || id.startsWith('lodash'),
};
