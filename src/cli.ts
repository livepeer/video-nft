import VodApi from './api';
import parseCli from './cli-args';
import { getDesiredBitrate, makeProfile } from './transcode';
import fs from 'fs';
import inquirer from 'inquirer';
import { Asset } from './types/schema';

async function videoNft() {
	const args = await parseCli();
	const api = new VodApi(args.apiKey, args.apiEndpoint);

	printStep('Requesting upload URL...');
	const {
		url: uploadUrl,
		asset: { id: assetId },
		task: importTask
	} = await api.requestUploadUrl(args.assetName);
	console.log(`Pending asset with id=${assetId}`);

	printStep('Uploading file...');
	let file: fs.ReadStream | null = null;
	try {
		file = fs.createReadStream(args.filename);
		await api.uploadFile(uploadUrl, file);
	} finally {
		file?.close();
	}
	await api.waitTask(importTask);

	let asset = await api.getAsset(assetId ?? '');
	asset = await maybeTranscode(api, asset);

	printStep('Starting export...');
	let { task: exportTask } = await api.exportAsset(
		asset.id ?? '',
		JSON.parse(args.nftMetadata)
	);
	console.log(`Created export task with id=${exportTask.id}`);
	exportTask = await api.waitTask(exportTask);

	const result = exportTask.output?.export?.ipfs;
	printStep(
		`Export successful! Result: \n${JSON.stringify(result, null, 2)}`
	);

	printStep(
		`Mint your NFT at:\n` +
			`https://livepeer.com/mint-nft?tokenUri=${result?.nftMetadataUrl}`
	);
}

async function maybeTranscode(api: VodApi, asset: Asset) {
	const desiredBitrate = await getDesiredBitrate(asset).catch(() => {
		console.error(
			`Warning: Asset is larger than OpenSea file limit and can't be transcoded down since it's too large. ` +
				`It will still be stored in IPFS and referenced in the NFT metadata, so a proper application is still able to play it back. ` +
				`For more information check http://bit.ly/opensea-file-limit`
		);
		return null;
	});
	if (!desiredBitrate) {
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
	const desiredProfile = makeProfile(asset, desiredBitrate);
	printStep(
		`Transcoding asset to ${desiredProfile.name} at ${Math.round(
			desiredProfile.bitrate / 1024
		)} kbps bitrate`
	);
	const transcode = await api.transcodeAsset(asset, desiredProfile);
	await api.waitTask(transcode.task);
	return transcode.asset;
}

let currStep = 0;
const printStep = (msg: string) => console.log(`${++currStep}. ${msg}`);

videoNft().catch(err => {
	console.error(err);
	process.exit(1);
});
