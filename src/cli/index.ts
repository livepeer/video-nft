import inquirer from 'inquirer';

import parseCli from './args';
import { minter, Asset } from '..';

async function videoNft() {
	const args = await parseCli();
	const { apiKey, apiEndpoint: endpoint } = args;
	const uploader = new minter.Uploader();
	const sdk = new minter.Api({
		auth: { apiKey },
		endpoint
	});

	let asset = await uploader.useFile(args.filename, file => {
		printStep('Uploading file...');
		return sdk.createAsset(args.assetName, file, printProgress);
	});
	asset = await maybeTranscode(sdk, asset);

	printStep('Starting export...');
	let ipfs = await sdk.exportToIPFS(
		asset.id,
		args.nftMetadata,
		printProgress
	);
	console.log(
		`Export successful! Result: \n${JSON.stringify(ipfs, null, 2)}`
	);

	printStep(
		`Mint your NFT at:\n` +
			`https://livepeer.com/mint-nft?tokenUri=${ipfs?.nftMetadataUrl}`
	);
}

function printProgress(progress: number) {
	console.log(` - progress: ${100 * progress}%`);
}

async function maybeTranscode(sdk: minter.Api, asset: Asset) {
	const { possible, desiredProfile } = sdk.checkNftNormalize(asset);
	if (!possible || !desiredProfile) {
		if (!possible) {
			console.error(
				`Warning: Asset is larger than OpenSea file limit and can't be transcoded down since it's too large. ` +
					`It will still be stored in IPFS and referenced in the NFT metadata, so a proper application is still able to play it back. ` +
					`For more information check http://bit.ly/opensea-file-limit`
			);
		}
		return asset;
	}

	console.log(
		`File is too big for OpenSea 100MB limit (learn more at http://bit.ly/opensea-file-limit).`
	);
	const { action } = await inquirer.prompt({
		type: 'list',
		name: 'action',
		message: 'What do you want to do?',
		choices: [
			{
				value: 'transcode',
				name: 'Transcode it to a lower quality so OpenSea is able to preview'
			},
			{
				value: 'ignore',
				name: 'Mint it as is (should work in any other platform that uses the NFT file)'
			}
		]
	});
	if (action === 'ignore') {
		return asset;
	}
	printStep(
		`Transcoding asset to ${desiredProfile.name} at ${Math.round(
			desiredProfile.bitrate / 1024
		)} kbps bitrate`
	);
	return await sdk.nftNormalize(asset, printProgress);
}

let currStep = 0;
const printStep = (msg: string) => console.log(`${++currStep}. ${msg}`);

videoNft().catch(err => {
	console.error(err);
	process.exit(1);
});
