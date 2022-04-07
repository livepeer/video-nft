/**
 * This module provides the highest-level abstractions of the SDK with all the
 * utilities for minting an NFT from a video file.
 *
 * @remarks
 * On a production app, each part of the flow will likely be in a different part
 * of your stack. In the most common case:
 *  * The {@link Uploader} will be used the closest to your users, where they
 *    provide the files and upload them to a URL provided by the Livepeer API.
 *  * The {@link Api} will be used to call the Livepeer VOD API. Since using the
 *    API requires having an API key, this should probably stay in a private
 *    part of your stack like your backend. It can be used and will work from
 *    the frontend for development purposes anyway, or if you configure your
 *    backend as a proxy to the API that injects the API key into the request.
 *    See
 *    {@link https://github.com/victorges/livepeer-web-api-proxy | Livepeer Web API Proxy}
 *    for a sample project of that.
 *  * The {@link Web3} will be used to interact with the Ethereum-compatible
 *    blockchain. It is most commonly used from the browser, connecting to your
 *    users' web3 wallet like MetaMask. It can also be used from the backend if
 *    you'd prefer to mint all the NFTs yourself, maybe with a custom contract
 *    from which you can mint directly to your users' addresses.
 *
 * @remarks
 * The {@link FullMinter} class encapsulates all of the parts above, but it
 * serves mostly as an example of what the full minting flow would look like if
 * performed in a single place. Check its specific documentation for more
 * details.
 *
 * @packageDocumentation
 */

import { ethers } from 'ethers';
import fs from 'fs';

import { VodApi, Task, ApiOptions } from './api';
import { fileOpen } from 'browser-fs-access';
import { getDesiredBitrate, makeProfile } from './transcode';
import { Asset, FfmpegProfile } from './types/schema';
import { getBuiltinChain, toHexChainId } from './chains';

/**
 * Representation of either an `ethers` JSON RPC provider or the arguments
 * required for creating one. The `window.ethereum` object injected by MetaMask
 * is an acceptable value for this.
 */
export type EthereumOrProvider =
	| ethers.providers.ExternalProvider
	| ethers.providers.JsonRpcFetchFunc
	| ethers.providers.JsonRpcProvider;

const asJsonRpcProvider = (ethOrPrv?: EthereumOrProvider) =>
	!ethOrPrv
		? undefined
		: ethOrPrv instanceof ethers.providers.JsonRpcProvider
		? ethOrPrv
		: new ethers.providers.Web3Provider(ethOrPrv);

/**
 * Some helpful information about a newly minted NFT.
 */
export type MintedNftInfo = {
	/**
	 * The address of the smart contract on which the NFT was minted.
	 */
	contractAddress: string;
	/**
	 * The ID of the minted NFT which can be used to fetch information about it in
	 * the ERC-721 contract. Will only be available if the NFT contract emits a
	 * `Mint` event compatible with the {@link videoNftAbi}
	 */
	tokenId?: number;
	/**
	 * Helpful links about the NFT in OpenSea. Will only be available when using a
	 * {@link chains | built-in chain} for which we have the OpenSea parameters.
	 */
	opensea?: {
		/**
		 * URL directly to the token page in OpenSea. Might not be available in case
		 * the token ID is not known.
		 */
		tokenUrl?: string;
		/**
		 * Search URL for the smart contract, which is aggregated in OpenSea as a
		 * collection. Can be sent as a best-effort if the token URL is not known.
		 */
		contractUrl: string;
	};
};

/**
 * The ABI for the required interface that the NFT smart contract should
 * implement to be compatible with this SDK. Represented in ethers'
 * {@link https://docs.ethers.io/v5/api/utils/abi/formats/#abi-formats--human-readable-abi | human-readable ABI format}.
 *
 * @example
 * This can also be represented by the following Solidity interface:
 *
 * ```java
 * interface IVideoNFT {
 *    function mint(address owner, string memory tokenURI)
 *        public
 *        returns (uint256);
 *
 *    event Mint(
 *        address indexed sender,
 *        address indexed owner,
 *        string tokenURI,
 *        uint256 tokenId
 *    );
 * }
 * ```
 */
export const videoNftAbi = [
	'event Mint(address indexed sender, address indexed owner, string tokenURI, uint256 tokenId)',
	'function mint(address owner, string tokenURI) returns (uint256)'
] as const;

const isBrowser = typeof window !== 'undefined';

/**
 * Provides filesystem-access abstractions for the browser and node, and helpers
 * for uploading them to the Livepeer API for creating the NFTs.
 *
 * @remarks
 * In the **browser**: you would typically use the {@link pickFile} method for
 * opening a file picker and then {@link uploadFile} for sending the file
 * contents to a URL obtained via {@link Api.requestUploadUrl}.
 *
 * @remarks
 * In **node.js**: you should use {@link openFile} or {@link useFile} instead,
 * already passing the full path of the file that the user should have provided
 * to your application somehow. After that, you can use the same
 * {@link uploadFile} method to upload the file contents to the Livepeer API.
 */
export class Uploader {
	/**
	 * Browser-only: Opens the file picker from the operating system for the user
	 * to select a video file to upload.
	 *
	 * @remarks
	 * This method is only supported in the browser. It will throw an error if
	 * called from a different environment like node.js.
	 *
	 * @remarks
	 * The Livepeer VOD API currently only supports MP4 as a container format, so
	 * the file picker will only allow selecting files with the .mp4 extension.
	 *
	 * @returns A promise that will be resolved with the `File` that the
	 * user picks in the file picker.
	 */
	async pickFile() {
		if (!isBrowser) {
			throw new Error('pickFile is only supported in the browser');
		}
		const { handle } = await fileOpen({
			description: 'MP4 Video files',
			mimeTypes: ['video/mp4'],
			extensions: ['.mp4']
		});
		const file = await handle?.getFile();
		if (!file) {
			throw new Error('Failed to open file');
		}
		return file;
	}

	/**
	 * Node-only: Opens the file at the given path for reading.
	 *
	 * @remarks
	 * This method is only supported in node.js. It will throw an error if called
	 * from a different environment like the browser.
	 *
	 * @param path The full path of the file to open.
	 *
	 * @returns A `fs.ReadStream` with the file contents.
	 */
	openFile(path: string) {
		if (isBrowser) {
			throw new Error('openFile is only supported in node.js');
		}
		return fs.createReadStream(path);
	}

	/**
	 * Node-only: Opens a file for reading and passes it to the given `handler`,
	 * closing the read stream as soon as the `handler` is done.
	 *
	 * @remarks
	 * This method is only supported in node.js. It will throw an error if called
	 * from a different environment like the browser.
	 *
	 * @remarks
	 * This is only a helpful abstraction on top of {@link openFile} so you don't
	 * need to handle the `fs.ReadStream` lifecycle yourself.
	 *
	 * @param path The full path of the file to open.
	 *
	 * @param handler A function that will be called with the `fs.ReadStream`. If
	 * it returns a promise, the file read stream will only be closed when the
	 * promise is resolved.
	 *
	 * @returns The same value that was returned by the handler, maybe wrapped in
	 * a promise.
	 */
	async useFile<T>(
		path: string,
		handler: (file: fs.ReadStream) => PromiseLike<T> | T
	) {
		if (isBrowser) {
			throw new Error('useFile is only supported in node.js');
		}
		let file: fs.ReadStream | null = null;
		try {
			file = this.openFile(path);
			return await handler(file);
		} finally {
			file?.close();
		}
	}

	/**
	 * Uploads a file to the Livepeer API using a direct upload URL obtained via
	 * {@link Api.requestUploadUrl}.
	 *
	 * @remarks
	 * This is simply a proxy to {@link VodApi.uploadFile}, exposed here as a
	 * helper so you don't need to interact with the {@link VodApi} class directly
	 * as well.
	 *
	 * @param url The direct upload URL obtained via {@link Api.requestUploadUrl}.
	 *
	 * @param content The file contents to upload.
	 *
	 * @returns A promise that will be completed when the upload is done.
	 */
	uploadFile(
		url: string,
		content: File | NodeJS.ReadableStream,
		reportProgress?: (progress: number) => void,
		mimeType?: string
	) {
		return VodApi.uploadFile(url, content, reportProgress, mimeType);
	}
}

/**
 * Provides higher-level abstractions on top of the Livepeer VOD API focused on
 * the NFT-minting process.
 *
 * @remarks
 * This class requires an API key to be used for calling the Livepeer API. As
 * such, it is most appropriately used in a secure context like a backend server
 * (even if only acting as a proxy). It can still be used from the browser with
 * a CORS-enabled API key, but beware that the API key will be exposed for
 * anyone that grabs it from your web page.
 */
export class Api {
	public vod: VodApi;

	/**
	 * Creates a new `Api` instance with the given API configuration.
	 *
	 * @remarks
	 * If you're running a backend proxy like
	 * {@link https://github.com/victorges/livepeer-web-api-proxy | Livepeer Web API Proxy}
	 * you can pass an empty configuration to the API here. The client will use
	 * the same endpoint as the current page by default and won't include any
	 * credentials in the requests. All API paths are prefixed with `/api`.
	 *
	 * @param api The options to pass to the Livepeer API client.
	 */
	constructor(api: ApiOptions) {
		this.vod = new VodApi(api);
	}

	/**
	 * Request a direct upload URL for a file to be uploaded to the API.
	 *
	 * @remarks
	 * This is simply a proxy to {@link VodApi.requestUploadUrl}, exposed here as
	 * a helper so you don't need to interact with the {@link VodApi} class
	 * directly as well.
	 *
	 * @param name The name of the asset that will be created.
	 *
	 * @returns An object with the `url` and created `asset` and `task`. The
	 * `asset` and `task` can be used to track the progress of the upload (see
	 * {@link waitTask}).
	 */
	requestUploadUrl(name: string) {
		return this.vod.requestUploadUrl(name);
	}

	/**
	 * Utility for performing the full file upload process for creating an asset
	 * in the Livepeer API.
	 *
	 * @remarks
	 * This assumes you are calling both {@link requestUploadUrl} and
	 * {@link uploadFile} from the same place. In the most efficient scenario, you
	 * would only create an upload URL from your backend, forward it to your
	 * frontend and make the upload directly from the frontend.
	 *
	 * This one can be used to get started, it will only be either: more
	 * inefficient in case you pipe the whole file contents through your backend,
	 * or; insecure if you call the Livepeer API from the frontend.
	 *
	 * @param name The name of the asset that will be created.
	 *
	 * @param content The content of the file to be uploaded.
	 *
	 * @param reportProgress A function that will be called periodically with the
	 * progress of the upload. Parts of it only work in the browser.
	 *
	 * @returns The newly created and already processed/populated {@link Asset}.
	 */
	async createAsset(
		name: string,
		content: File | NodeJS.ReadableStream,
		reportProgress: (progress: number) => void = () => {}
	) {
		const uploader = new Uploader();
		const {
			url: uploadUrl,
			asset: { id: assetId },
			task
		} = await this.requestUploadUrl(name);
		await uploader.uploadFile(uploadUrl, content, p =>
			reportProgress(p / 2)
		);
		await this.waitTask(task, p => reportProgress(0.5 + p / 2));
		return await this.vod.getAsset(assetId);
	}

	/**
	 * Checks if the specified asset requires any special processing before being
	 * minted as an NFT.
	 *
	 * @remarks
	 * This is an optional function call, you can also just call
	 * {@link nftNormalize} directly to have the video asset processed in the best
	 * way possible for being minted as an NFT. This function is useful only if
	 * you want to show some feedback to the user, like asking if they want to
	 * mint the asset as is or process it first.
	 *
	 * @param asset The asset to check. It must have been fully populated with the
	 * video metadata, meaning that the {@link Task} that created it must have
	 * already completed.
	 *
	 * @param sizeLimit The size limit to shrink the asset to. Defaults to 100MB.
	 *
	 * @returns An object with 2 fields `possible` and `desiredProfile`. The
	 * `possible` field is a boolean indicating if the asset can actually be
	 * normalized or not, i.e. if there is any acceptable bitrate to reduce its
	 * size below the `sizeLimit`. The `desiredProfile` field is the video profile
	 * that should be used to transcode the asset, if `possible`.
	 */
	checkNftNormalize(asset: Asset, sizeLimit?: number) {
		let desiredProfile: FfmpegProfile | null = null;
		try {
			const desiredBitrate = getDesiredBitrate(asset, sizeLimit);
			if (desiredBitrate) {
				desiredProfile = makeProfile(asset, desiredBitrate);
			}
			return {
				possible: true,
				desiredProfile
			};
		} catch (e) {
			return { possible: false, desiredProfile };
		}
	}

	/**
	 * Normalizes the specified asset fot the best possible NFT.
	 *
	 * @remarks
	 * Normalization means transcoding the asset to a better suitable format,
	 * codec and quality. Currently, this means ensuring that the asset fits
	 * within the limit of some NFT marketplaces like OpenSea, which has a strict
	 * {@link
	 * https://support.opensea.io/hc/en-us/articles/360061943574-What-file-formats-can-I-use-to-make-NFTs-Is-there-a-maximum-size-
	 * | file size limit of 100 MB}. Check the {@link getDesiredBitrate} and
	 * {@link makeProfile} for more information on how that calculation is made.
	 *
	 * @param asset The asset to normalize. It must have been fully populated with
	 * the video metadata, meaning that the {@link Task} that created it must have
	 * already completed.
	 *
	 * @param reportProgress A function that will be called periodically with the
	 * progress of the transcode task.
	 *
	 * @param sizeLimit The size limit to shrink the asset to. Defaults to 100MB.
	 *
	 * @returns The new asset created with the normalized video spec.
	 */
	async nftNormalize(
		asset: Asset,
		reportProgress?: (progress: number) => void,
		sizeLimit?: number
	) {
		const { possible, desiredProfile } = this.checkNftNormalize(
			asset,
			sizeLimit
		);
		if (!possible || !desiredProfile) {
			return asset;
		}

		const transcode = await this.vod.transcodeAsset(
			asset.id,
			`${asset.name} (${desiredProfile.name})`,
			desiredProfile
		);
		await this.waitTask(transcode.task, reportProgress);
		return await this.vod.getAsset(transcode.asset.id);
	}

	/**
	 * Exports an asset to decentralized storage (IPFS).
	 *
	 * @remarks
	 * This actually exports 2 files to IPFS:
	 *  * One with the raw contents of the video asset
	 *  * Another one with the NFT metadata in IPFS pointing to the above file. So
	 *    you can mint the NFT directly with the URL of this file as the
	 *    `tokenUri` of the ERC-721 contract.
	 *
	 * @remarks
	 * You can also customize the NFT metadata created by passing the
	 * `nftMetadata` argument to this function. This will be deep merged with the
	 * default metadata created for the NFT.
	 *
	 * @param assetId The ID of the asset to export.
	 *
	 * @param nftMetadata The custom overrides for fields in the NFT metadata. You
	 * can change the value of any field by specifying it here, or delete any
	 * default field by specifying `null`.
	 *
	 * @param reportProgress A function that will be called periodically with the
	 * progress of the export task.
	 *
	 * @returns The information about the files exported to IPFS. Use the
	 * `nftMetadataUrl` field as the `tokenUri` for minting the NFT of the asset.
	 */
	async exportToIPFS(
		assetId: string,
		nftMetadata?: string | Record<string, any>,
		reportProgress?: (progress: number) => void
	) {
		if (typeof nftMetadata === 'string') {
			nftMetadata = JSON.parse(nftMetadata) as Record<string, any>;
		}
		let { task } = await this.vod.exportAsset(assetId, {
			ipfs: { nftMetadata }
		});
		task = await this.waitTask(task, reportProgress);
		const ipfs = task.output?.export?.ipfs;
		return ipfs as NonNullable<typeof ipfs>;
	}

	/**
	 * Wait until a specified task is completed.
	 *
	 * @remarks
	 * This will simply call the `getTask` API repeatedly until the task is either
	 * successful or failed. For a promise-like API this will also throw an
	 * exception in case the task is failed.
	 *
	 * @param task - The task object that should be waited for.
	 * @param reportProgress - An optional callback to be called with the progress
	 * of the running task, which is a number for 0 to 1. Useful for showing some
	 * UI feedback to users.
	 *
	 * @returns The finished `Task` object also containing the task output. Check
	 * the `output` field for the respective output depending on the task `type`.
	 */
	async waitTask(task: Task, reportProgress?: (progress: number) => void) {
		let lastProgress = 0;
		while (
			task.status?.phase !== 'completed' &&
			task.status?.phase !== 'failed'
		) {
			const progress = task.status?.progress;
			if (progress && progress !== lastProgress) {
				if (reportProgress) reportProgress(progress);
				lastProgress = progress;
			}
			new Promise(resolve => setTimeout(resolve, 2500));
			task = await this.vod.getTask(task.id ?? '');
		}

		if (task.status.phase === 'failed') {
			throw new Error(
				`${task.type} task failed. error: ${task.status.errorMessage}`
			);
		}
		return task;
	}
}

/**
 * Options for creating a {@link Web3} instance.
 */
export type Web3Options = {
	/**
	 * The blockchain-access provider, either from `ethers` or the wallet.
	 *
	 * @remarks
	 * This can be either an external provider, as exposed as a `window.ethereum`
	 * object by some web3 wallets like MetaMask or a custom provider created with
	 * the `ethers` library. You will likely need to instantiate a custom provider
	 * if you are using this from node.js.
	 */
	ethereum: EthereumOrProvider;
	/**
	 * The ID of the blockchain that is currently connected.
	 *
	 * @remarks
	 * This would not be really necessary since we can get it from the `ethereum`
	 * provider but `ethers` library explodes if the chain changes. So we only
	 * force the `chainId` to be sent here so it's clear that you need to recreate
	 * the {@link Web3} instance anytime the chain changes. You also need to
	 * recreate your custom `ethers` provider if you are creating one manually.
	 */
	chainId: string | number;
};

/**
 * Provides abstractions for interacting with an Ethereum-compatible blockchain
 * and minting an NFT.
 *
 * @remarks
 * This currently only works with smart contracts compatible with the
 * {@link videoNftAbi} interface. If you deploy your own contract, you can pass
 * its address to the minting functions here but it has to implement the
 * specified interface or not all of the functionality here will work.
 */
export class Web3 {
	private ethProvider?: ethers.providers.JsonRpcProvider;
	private chainId: string;

	/**
	 * Creates a new `Web3` instance with the provided options.
	 *
	 * @param web3 Options for the web3 provider.
	 */
	constructor(web3: Web3Options) {
		this.ethProvider = asJsonRpcProvider(web3.ethereum);
		this.chainId = toHexChainId(web3.chainId);
	}

	/**
	 * Sends a transaction to the blockchain calling the `mint` function of the
	 * specified contract.
	 *
	 * @remarks
	 * The `tokenUri` should likely be obtained from a function like
	 * {@link Api.exportToIPFS} but you can pass any URL here for the NFT. For
	 * example you can export the asset to IPFS but then create a custom metadata
	 * file in IPFS in case our current API doesn't work for your use case. We
	 * only suggest that you use a decentralized and immutable storage like IPFS
	 * for further reliability of the NFT over time.
	 *
	 * @remarks
	 * The default smart contracts do not allow minting to other addresses. So the
	 * recipient of the NFT must always be the one that calls the mint
	 * transaction. Here it means that you should not provide the `to` argument
	 * and it will be obtained automatically from the provider.
	 *
	 * @param tokenUri The URI of the NFT. This is normally the `nftMetadataUrl`
	 * field returned by {@link Api.exportToIPFS}.
	 *
	 * @param contractAddress The address of the smart contract to use. If you're
	 * using one of the {@link chains | built-in chains} this will default to the
	 * Livepeer-deployed smart contract so you don't need to provide one.
	 *
	 * @param to An optional address for the recipient of the NFT. If using the
	 * default smart contracts, this must be omited or equal to the address
	 * sending the transaction.
	 *
	 * @returns The receipt of the transaction. Notice that this does not mean
	 * that the transaction is confirmed. To wait for that and also get the result
	 * of the minting process, check {@link getMintedNftInfo}.
	 */
	async mintNft(
		tokenUri: string,
		contractAddress?: string,
		to?: string
	): Promise<ethers.ContractTransaction> {
		contractAddress ||= getBuiltinChain(this.chainId)?.defaultContract;
		if (!contractAddress) {
			throw new Error('No contract address provided nor builtin chain');
		}
		if (!this.ethProvider) {
			throw new Error('No Ethereum provider configured');
		}
		const net = await this.ethProvider.getNetwork();
		const currChainId = toHexChainId(net.chainId);
		if (currChainId !== this.chainId) {
			throw new Error(
				`Inconsistent chain ID: created for ${this.chainId} but found ${currChainId}`
			);
		}

		const signer = this.ethProvider.getSigner();
		const videoNft = new ethers.Contract(
			contractAddress,
			videoNftAbi,
			signer
		);
		const owner = to ?? (await signer.getAddress());
		return await videoNft.mint(owner, tokenUri);
	}

	/**
	 * Waits for a mint transaction to be confirmed and returns info about the
	 * minted NFT.
	 *
	 * @remarks
	 * This is the part of the minting process that relies on the `Mint` event
	 * from the {@link videoNftAbi}. You can use a contract that does not emit
	 * such event but you'll not be able to call this function to get the minted
	 * token ID.
	 *
	 * @param tx The transaction receipt as returned by {@link mintNft}.
	 *
	 * @returns Information about the just minted NFT.
	 */
	async getMintedNftInfo(
		tx: ethers.ContractTransaction
	): Promise<MintedNftInfo> {
		const receipt = await tx.wait();
		const contractAddress = receipt.to;
		const mintEv = receipt.events?.find(ev => ev?.event === 'Mint')?.args;
		const tokenId =
			mintEv && mintEv.length > 3
				? (mintEv[3].toNumber() as number)
				: undefined;
		let info: MintedNftInfo = { contractAddress, tokenId };
		const chainInfo = getBuiltinChain(this.chainId);
		if (chainInfo?.opensea) {
			const {
				opensea: { baseUrl, chainName }
			} = chainInfo;
			info = {
				...info,
				opensea: {
					contractUrl: `${baseUrl}/assets?search%5Bquery%5D=${contractAddress}`,
					tokenUrl: !tokenId
						? undefined
						: `${baseUrl}/assets/${chainName}/${contractAddress}/${tokenId}`
				}
			};
		}
		return info;
	}
}

/**
 * This encapsulates all the parts necessary for creating a Video NFT in a
 * single environment.
 *
 * @remarks
 * You might prefer **not** to use this in a production application, unless:
 *  * You are running a proxy to the Livepeer API that simply injects an API key
 *    to the requests from your frontend. See the `Split backend and browser`
 *    example in the SDK readme for more information.
 *  * You are OK exposing an API key in the {@link Api} component in your
 *    frontend. Doing that means that anyone can grab the key from your web page
 *    and call any Livepeer API on your behalf, so use with caution.
 *  * You are doing the whole flow from your backend, including the {@link Web3}
 *    minting part. This means that you will be calling the Ethereum-compatible
 *    blockchain and paying for the transactions yourself. The users will likely
 *    have less control of what is being done as well.
 *  * Something else that we haven't considered! Do not limit yourself by this
 *    documentation, but do consider the security and ownership implications of
 *    any such setup.
 */
export class FullMinter {
	public uploader: Uploader;
	public api: Api;
	public web3: Web3;

	/**
	 * Creates a `FullMinter` instance with the provided configurations for the
	 * {@link Api} and {@link Web3} sub-components.
	 *
	 * @param api The configuration for the {@link Api} component.
	 *
	 * @param web3 The configuration for the {@link Web3} component.
	 */
	constructor(
		api: ApiOptions,
		web3: {
			ethereum: EthereumOrProvider;
			chainId: string | number;
		}
	) {
		this.uploader = new Uploader();
		this.api = new Api(api);
		this.web3 = new Web3(web3);
	}

	/**
	 * Demonstrates the entire NFT minting process. Check the source code of this
	 * function to have a better idea of the whole process.
	 *
	 * @remarks
	 * The `filename` parameter **must** be provided in a node.js environment, and
	 * **cannot** be provided in a browser environment.
	 *
	 * @param args Aggregated arguments for all the functions that are called
	 * along the process.
	 *
	 * @returns	Information about the minted NFT.
	 */
	async createNft(args: {
		file?: File | NodeJS.ReadableStream | string;
		name: string;
		skipNormalize?: boolean;
		nftMetadata?: string | Record<string, any>;
		mint?: {
			contractAddress?: string;
			to?: string;
		};
	}) {
		const file =
			typeof args.file === 'string'
				? this.uploader.openFile(args.file)
				: args.file ?? (await this.uploader.pickFile());
		let asset = await this.api.createAsset(args.name, file);
		if (!args.skipNormalize) {
			asset = await this.api.nftNormalize(asset);
		}
		const { nftMetadataUrl } = await this.api.exportToIPFS(
			asset.id,
			args.nftMetadata
		);
		const { contractAddress, to } = args?.mint ?? {};
		const tx = await this.web3.mintNft(
			nftMetadataUrl ?? '',
			contractAddress,
			to
		);
		return await this.web3.getMintedNftInfo(tx);
	}
}
