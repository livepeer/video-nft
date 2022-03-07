import VodApi from './api';
import parseCli from './cli';
import { getDesiredProfile } from './transcode';

async function videoNft() {
	const args = await parseCli();
	const api = new VodApi(args.apiKey, args.apiEndpoint);

	console.log('1. Requesting upload URL... ');
	const {
		url: uploadUrl,
		asset: { id: assetId },
		task: importTask
	} = await api.requestUploadUrl(args.assetName);
	console.log(`Pending asset with id=${assetId}`);

	console.log('2. Uploading file...');
	await api.uploadFile(uploadUrl, args.filename as string);
	await api.waitTask(importTask);

	let asset = await api.getAsset(assetId ?? '');
	const desiredProfile = await getDesiredProfile(asset);
	if (desiredProfile) {
		console.log(
			`3. Transcoding asset to ${desiredProfile.name} at ${Math.round(
				desiredProfile.bitrate / 1024
			)} kbps bitrate`
		);
		const transcode = await api.transcodeAsset(asset, desiredProfile);
		await api.waitTask(transcode.task);
		asset = transcode.asset;
	}

	console.log('3. Starting export... ');
	let { task: exportTask } = await api.exportAsset(
		asset.id ?? '',
		JSON.parse(args.nftMetadata)
	);
	console.log(`Created export task with id=${exportTask.id}`);
	exportTask = await api.waitTask(exportTask);

	const result = exportTask.output?.export?.ipfs;
	console.log(
		`4. Export successful! Result: \n${JSON.stringify(result, null, 2)}`
	);

	console.log(
		`5. Mint your NFT at:\n` +
			`https://livepeer.com/mint-nft?tokenUri=${result?.nftMetadataUrl}`
	);
}

videoNft().catch(err => {
	console.error(err);
	process.exit(1);
});
