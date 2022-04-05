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

import { VodApi, ApiAuthentication } from './api';
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
		tokenUrl?: string;
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
		content: File | fs.ReadStream,
		reportProgress?: (progress: number) => void,
		mimeType?: string
	) {
		return VodApi.uploadFile(url, content, reportProgress, mimeType);
	}
}

export class Api {
	public vod: VodApi;

	constructor(api: { auth?: ApiAuthentication; endpoint?: string }) {
		this.vod = new VodApi(api.auth, api.endpoint);
	}

	requestUploadUrl(name: string) {
		return this.vod.requestUploadUrl(name);
	}

	async createAsset(
		name: string,
		content: File | fs.ReadStream,
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
		await this.vod.waitTask(task, p => reportProgress(0.5 + p / 2));
		return await this.vod.getAsset(assetId);
	}

	checkNftNormalize(asset: Asset) {
		let desiredProfile: FfmpegProfile | null = null;
		try {
			const desiredBitrate = getDesiredBitrate(asset);
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

	async nftNormalize(
		asset: Asset,
		reportProgress?: (progress: number) => void
	) {
		const { possible, desiredProfile } = this.checkNftNormalize(asset);
		if (!possible || !desiredProfile) {
			return asset;
		}

		const transcode = await this.vod.transcodeAsset(
			asset.id,
			`${asset.name} (${desiredProfile.name})`,
			desiredProfile
		);
		await this.vod.waitTask(transcode.task, reportProgress);
		return await this.vod.getAsset(transcode.asset.id);
	}

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
		task = await this.vod.waitTask(task, reportProgress);
		return task.output?.export?.ipfs;
	}
}

export class Web3 {
	private ethProvider?: ethers.providers.JsonRpcProvider;
	private chainId: string;

	constructor(web3: {
		ethereum: EthereumOrProvider;
		chainId: string | number;
	}) {
		this.ethProvider = asJsonRpcProvider(web3.ethereum);
		// The chainId would not be really necessary since we can get it from the
		// provider. But the provider explodes if the chain changes, so we force
		// users to send the chainId here so it's clear they need to recreate
		// the SDK instance if the chain changes.
		this.chainId = toHexChainId(web3.chainId);
	}

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

	async getMintedNftInfo(
		tx: ethers.ContractTransaction
	): Promise<MintedNftInfo> {
		const receipt = await tx.wait();
		const mintEv = receipt.events?.find(ev => ev?.event === 'Mint')?.args;
		const tokenId =
			mintEv && mintEv.length > 3
				? (mintEv[3].toNumber() as number)
				: undefined;
		let info: MintedNftInfo = { tokenId };
		const chainInfo = getBuiltinChain(this.chainId);
		if (chainInfo?.opensea) {
			const {
				opensea: { baseUrl, chainName }
			} = chainInfo;
			const { to: contractAddr } = receipt;
			info = {
				...info,
				opensea: {
					contractUrl: `${baseUrl}/assets?search%5Bquery%5D=${contractAddr}`,
					tokenUrl: !tokenId
						? undefined
						: `${baseUrl}/assets/${chainName}/${contractAddr}/${tokenId}`
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
 * This should be used only as an example of what it would look like if the full
 * minting flow was performed in a single part of the stack.
 *
 * @remarks
 * You will most likely not use this in a production application, unless:
 *  * You are OK exposing an API key in the {@link Api} component in your
 *    frontend. Doing that means that anyone can grab the key from your web page
 *    and call any Livepeer API on your behalf (even the ones you're not using
 *    in your app).
 *  * You are doing the {@link Web3} minting part in your backend. This means
 *    that you will be calling the Ethereum-compatible blockchain and paying for
 *    the transactions yourself. The users will likely have less control of what
 *    is being done as well.
 *  * Something else that we haven't considered! Do not limit yourself by this
 *    documentation, but do consider the security and ownership implications of
 *    any such setup.
 */
export class FullMinter {
	public uploader: Uploader;
	public api: Api;
	public web3: Web3;

	constructor(
		api: { auth?: ApiAuthentication; endpoint?: string },
		web3: {
			ethereum: EthereumOrProvider;
			chainId: string | number;
		}
	) {
		this.uploader = new Uploader();
		this.api = new Api(api);
		this.web3 = new Web3(web3);
	}

	async createNft(args: {
		assetName: string;
		skipNormalize: boolean;
		nftMetadata: string;
		mint: {
			contractAddress?: string;
			to?: string;
		};
	}) {
		const file = await this.uploader.pickFile();
		let asset = await this.api.createAsset(args.assetName, file);
		if (!args.skipNormalize) {
			asset = await this.api.nftNormalize(asset);
		}
		const ipfsInfo = await this.api.exportToIPFS(
			asset.id,
			args.nftMetadata
		);
		if (!args.mint) {
			return null;
		}
		const {
			mint: { contractAddress, to }
		} = args;
		const tx = await this.web3.mintNft(
			ipfsInfo?.nftMetadataUrl ?? '',
			contractAddress,
			to
		);
		return this.web3.getMintedNftInfo(tx);
	}
}
