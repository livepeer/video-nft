import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';

import builtins from 'rollup-plugin-node-builtins';
import minify from 'rollup-plugin-babel-minify';
import baseTypescript from 'rollup-plugin-typescript2';
import dts from 'rollup-plugin-dts';

import pkg from './package.json';

const typescript = () => baseTypescript({ useTsconfigDeclarationDir: true });

export default [
	// browser-friendly UMD build
	{
		input: 'src/index.ts',
		output: {
			name: 'video-nft',
			file: pkg.browser,
			format: 'umd',
			sourcemap: true
		},
		plugins: [
			builtins(),
			resolve({ browser: true }),
			json(),
			commonjs(),
			typescript(),
			minify({
				mangle: false,
				comments: false
			})
		]
	},
	// CommonJS (for Node) and ES module (for bundlers) build.
	{
		input: 'src/index.ts',
		external: ['axios', 'ethers', 'yargs', 'inquirer'],
		plugins: [
			resolve({ resolveOnly: ['browser-fs-access'] }),
			commonjs(),
			typescript()
		],
		output: [
			{ file: pkg.main, format: 'cjs', sourcemap: true },
			{ file: pkg.module, format: 'es', sourcemap: true }
		]
	},
	{
		input: ['dist/types/index.d.ts'],
		output: [{ file: 'dist/index.d.ts', format: 'es' }],
		plugins: [dts()]
	},
	// cli
	{
		input: 'src/cli/index.ts',
		external: [
			'axios',
			'ethers',
			'fs',
			'inquirer',
			'path',
			'yargs',
			'yargs/helpers'
		],
		plugins: [
			resolve({ resolveOnly: ['browser-fs-access'] }),
			commonjs(),
			typescript()
		],
		output: { file: pkg.cli, format: 'cjs', sourcemap: true }
	}
];
