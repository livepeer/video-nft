import * as path from 'path';
import * as fs from 'fs';

import inquirer from 'inquirer';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { prodApiEndpoint } from '../api';

type Camel<T extends string> = T extends `${infer Left}-${infer Right}`
	? Camel<`${Left}${Capitalize<Right>}`>
	: T;

type CamelKeys<T> = {
	[K in keyof T as K extends string ? Camel<K> : K]: T[K];
};

type UnboxPromise<T> = T extends Promise<infer U> ? U : never;

type RawArgs = UnboxPromise<ReturnType<typeof parseRawArgs>>;

export type CliArgs = CamelKeys<{
	[K in keyof RawArgs]: Exclude<RawArgs[K], undefined>;
}>;

function parseRawArgs(argv?: string | readonly string[]) {
	return yargs
		.command('$0 [filename]', '1-command mint a video NFT')
		.positional('filename', {
			describe: 'file to upload as an NFT',
			type: 'string'
		})
		.options({
			'api-key': {
				describe: 'API key to use for Livepeer API',
				type: 'string'
			},
			'asset-name': {
				describe: 'name for the asset created in Livepeer.com API',
				type: 'string'
			},
			'nft-metadata': {
				describe:
					'additional JSON metadata to override default generated by Livepeer for the NFT',
				type: 'string',
				default: '{}'
			},
			'api-endpoint': {
				describe: 'the endpoint to use for the Livepeer API',
				type: 'string',
				default: prodApiEndpoint
			}
		})
		.usage(
			`
	Video NFT

  Mint a video NFT in 1 command with Livepeer.

	Usage: video-nft [filename] [options]`
		)
		.env('LP_')
		.help()
		.parse((argv as any) ?? hideBin(process.argv));
}

const uuidRegex =
	/^[0-9a-f]{8}\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\b[0-9a-f]{12}$/;

async function promptMissing(args: RawArgs): Promise<CliArgs> {
	let { apiKey, filename, assetName, nftMetadata } = args as Record<
		string,
		string
	>;
	if (!apiKey) {
		apiKey = await inquirer
			.prompt({
				type: 'password',
				name: 'apiKey',
				message:
					'Enter your Livepeer API key (learn more at http://bit.ly/lp-api-key):',
				mask: '*',
				validate: apiKey =>
					uuidRegex.test(apiKey) || 'Not a valid API key'
			})
			.then(ans => ans.apiKey as string);
		console.log(
			'Tip: You can set the LP_API_KEY environment variable to avoid this prompt.'
		);
	}
	if (!filename) {
		filename = await inquirer
			.prompt({
				type: 'input',
				name: 'filename',
				message: 'What file do you want to use?',
				validate: (value: string) =>
					fs.existsSync(value) || 'File does not exist'
			})
			.then(ans => ans.filename);
		console.log(
			'You can also send the filename as an argument to this command.'
		);
	}
	if (!assetName) {
		assetName = await inquirer
			.prompt({
				type: 'input',
				name: 'assetName',
				message: `What name do you want to give to your NFT?`,
				default: path.basename(filename)
			})
			.then(ans => ans.assetName);
	}
	if (nftMetadata === '{}') {
		const { shouldEdit } = await inquirer.prompt({
			type: 'confirm',
			name: 'shouldEdit',
			message: `Would you like to customize the NFT metadata?`,
			default: false
		});
		if (shouldEdit) {
			console.log(
				' - The `animation_url` and `properties.video` fields will be populated with the exported video URL.'
			);
			console.log(' - Set any field to `null` to delete it.');
			nftMetadata = await inquirer
				.prompt({
					type: 'editor',
					name: 'nftMetadata',
					message: 'Open text editor:',
					default: JSON.stringify(
						{
							name: assetName,
							description: `Livepeer video from asset ${JSON.stringify(
								assetName
							)}`,
							image: `ipfs://bafkreidmlgpjoxgvefhid2xjyqjnpmjjmq47yyrcm6ifvoovclty7sm4wm`,
							properties: {}
						},
						null,
						2
					),
					validate: (value: string) => {
						try {
							JSON.parse(value);
							return true;
						} catch (e) {
							return `Invalid JSON: ${e}`;
						}
					}
				})
				.then(ans => ans.nftMetadata);
		}
	}
	return {
		...args,
		apiKey,
		filename,
		assetName,
		nftMetadata
	};
}

export default async function parseCli(
	argv?: string | readonly string[]
): Promise<CliArgs> {
	const args = await parseRawArgs(argv);
	if (args.filename && !fs.existsSync(args.filename)) {
		throw new Error(`File ${args.filename} does not exist`);
	}
	if (fs.existsSync(args.nftMetadata)) {
		args.nftMetadata = fs.readFileSync(args.nftMetadata, 'utf8');
	}
	try {
		if (args.nftMetadata != '{}') {
			const metadata = JSON.parse(args.nftMetadata);
			console.log(
				`Using metadata:\n${JSON.stringify(metadata, null, 2)}`
			);
		}
	} catch (e) {
		throw new Error(`Invalid JSON in nft-metadata: ${e}`);
	}
	return promptMissing(args);
}
