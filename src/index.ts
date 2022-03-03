import VodApi from './api';
import parseCli from './cli';
import { getDesiredProfile } from './transcode';

async function videoNft() {
	const args = await parseCli();
	const api = new VodApi(args.apiToken, args.apiEndpoint);

	console.log('1. Requesting upload URL... ');
	const {
		url: uploadUrl,
		asset: pendingAsset,
		task: importTask
	} = await api.requestUploadUrl(args.assetName);
	console.log(`Pending asset with id=${pendingAsset.id}`);

	console.log('2. Uploading file...');
	await api.uploadFile(uploadUrl, args.filename as string);
	await api.waitTask(importTask);

	let asset = await api.getAsset(pendingAsset.id ?? '');
	const desiredProfile = getDesiredProfile(asset);
	if (desiredProfile) {
		console.log(
			`3. File is too big for OpenSea 100MB limit (http://bit.ly/opensea-file-limit). Transcoding asset to ${
				desiredProfile.name
			} ${Math.round(desiredProfile.bitrate / 1024)} kbps bitrate`
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

	if (args.mintNft) {
		console.log(
			`5. Mint your NFT at:\n` +
				`https://livepeer-com-git-vg-feateth-tx-page-livepeer.vercel.app/transact/eth?tokenUri=${result?.nftMetadataUrl}`
		);
	}
}

videoNft().catch(err => {
	console.error(err);
	process.exit(1);
});
