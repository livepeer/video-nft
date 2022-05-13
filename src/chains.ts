/**
 *
 * This package provides some helper utilities for switching between different
 * Ethereum-compatible chains. It also describes the SDK built-in chains, in
 * which it already has a deployed smart contract.
 *
 * @remarks The current built-in chains are [Polygon
 * Mainnet](https://chainlist.org/chain/137) and [Polygon Testnet
 * (Mumbai)](https://chainlist.org/chain/80001).
 *
 * @remarks
 * A built-in chain is one that we have already deployed an ERC-721 contract
 * that implements the {@link minter.videoNftAbi | Video NFT ABI}. Those can be
 * used as a default contract with which to mint a Video NFT.
 *
 * @remarks When using a built-in chain you don't need to provide a contract
 * address on the calls to the {@link minter.Web3 | Web3 minter} for minting an
 * NFT. You can still provide one anyway if you wish to use your own contract,
 * but it does need to implement the {@link minter.videoNftAbi | Video NFT ABI}
 * for the SDK to work properly.
 *
 * @remarks You can also use custom chains that are not built-in, but you will
 * need always to provide your contract address to the
 * {@link minter.Web3 | Web3 minter} functions and handle any NFT marketplace
 * URLs or integrations.
 *
 * @packageDocumentation
 */

import { ethers, utils } from 'ethers';

/**
 * Defines the interface necessary for registering a new chain in a web3
 * wallet. Especifically tested with MetaMask.
 */
export type ChainSpec = {
	chainId: `0x${string}`;
	chainName: string;
	rpcUrls: string[];
	nativeCurrency: {
		symbol: string;
		decimals: number;
		[unknown: string]: any;
	};
	blockExplorerUrls: string[];
	iconUrls?: string[];
	[unknown: string]: any;
};

/**
 * Hexadecimal representation of a chain ID.
 */
export type HexChainId = `0x${string}`;

/**
 * Describes all the information about a built-in chain. Also contains some
 * helper information for generating NFT marketplace links (currently OpenSea).
 */
export type BuiltinChainInfo = {
	spec: ChainSpec;
	defaultContract: HexChainId;
	opensea?: {
		baseUrl: string;
		chainName: string;
	};
};

const builtinChains: Record<HexChainId, BuiltinChainInfo> = {
	'0x89': {
		spec: {
			chainId: '0x89',
			chainName: 'Polygon Mainnet',
			rpcUrls: ['https://polygon-rpc.com/'],
			nativeCurrency: { symbol: 'MATIC', decimals: 18 },
			blockExplorerUrls: ['https://polygonscan.com'],
			iconUrls: [
				'https://cloudflare-ipfs.com/ipfs/bafkreiduv5pzw233clfjuahv5lkq2xvjomapou7yarik2lynu3bjm2xki4'
			]
		},
		defaultContract: '0x69C53E7b8c41bF436EF5a2D81DB759Dc8bD83b5F',
		opensea: {
			baseUrl: 'https://opensea.io',
			chainName: 'matic'
		}
	},
	'0x13881': {
		spec: {
			chainId: '0x13881',
			chainName: 'Polygon Testnet',
			rpcUrls: ['https://matic-mumbai.chainstacklabs.com'],
			nativeCurrency: { symbol: 'MATIC', decimals: 18 },
			blockExplorerUrls: ['https://mumbai.polygonscan.com']
		},
		defaultContract: '0xA4E1d8FE768d471B048F9d73ff90ED8fcCC03643',
		opensea: {
			baseUrl: 'https://testnets.opensea.io',
			chainName: 'mumbai'
		}
	}
};

/**
 * Normalizes any representation of a chain ID into a hexadecimal string, in a
 * format supported by web3 wallets.
 *
 * @param chainId Chain ID to normalize.
 *
 * @returns Normalized hexadecimal string representing the chain ID.
 */
export function toHexChainId(chainId: string | number): HexChainId {
	if (chainId == null) {
		return '' as HexChainId;
	}
	return utils.hexValue(chainId) as HexChainId;
}

/**
 * Converts any representation of a chain ID into its numerical ID.
 *
 * @param chainId Chain ID to convert.
 *
 * @returns Numerical ID of the chain.
 */
export function toNumberChainId(chainId: string | number) {
	return parseInt(toHexChainId(chainId), 16);
}

/**
 * Returns whether the chain with the specified ID is built-in.
 *
 * @param chainId Chain ID to check.
 *
 * @returns Boolean representing whether the chain is built-in.
 */
export function isChainBuiltin(chainId: string | number) {
	return !!builtinChains[toHexChainId(chainId)];
}

/**
 * Gets a list of the built-in chains IDs.
 *
 * @returns List of built-in chain IDs in hexadecimal format.
 */
export function listBuiltinChains() {
	return Object.keys(builtinChains) as HexChainId[];
}

/**
 * Gets the information about the built-in chain with the specified chain ID.
 *
 * @param chainId ID of the chain to get information about.
 *
 * @returns The built-in chain information or `null` if it's not built-in.
 */
export function getBuiltinChain(
	chainId: string | number
): BuiltinChainInfo | null {
	return builtinChains[toHexChainId(chainId)] || null;
}

/**
 * Requests the web3 wallet to switch the current chain to the specified one.
 *
 * @param ethereum Web3 connectivity external provider. In the case of MetaMask
 * this is the object injected into `window.ethereum`.
 *
 * @param chainId The ID of the chain to switch to.
 *
 * @returns Promise that will be fulfilled when the switch is complete (e.g.
 * after user approves it).
 */
export async function switchChain(
	ethereum: ethers.providers.ExternalProvider,
	chainId: string
) {
	if (!ethereum.request) {
		throw new Error('ethereum provider does not support request');
	}
	await ethereum.request({
		method: 'wallet_switchEthereumChain',
		params: [{ chainId }]
	});
}

/**
 * Requests the web3 wallet to add a chain to the wallet and switch to it.
 *
 * @param ethereum Web3 connectivity external provider. In the case of MetaMask
 * this is the object injected into `window.ethereum`.
 *
 * @param chainSpec The full specification of the chain to add.
 *
 * @returns Promise that will be fulfilled when the switch is complete (e.g.
 * after user approves it).
 */
export async function addChain(
	ethereum: ethers.providers.ExternalProvider,
	chainSpec: ChainSpec
) {
	if (!ethereum.request) {
		throw new Error('ethereum provider does not support request');
	}
	await ethereum.request({
		method: 'wallet_addEthereumChain',
		params: [chainSpec]
	});
}

/**
 * Composes {@link switchChain} and {@link addChain} to switch to the specified
 * chain if it is already configured or otherwise add it to the wallet and then
 * switch to it.
 *
 * @param ethereum Web3 connectivity external provider. In the case of MetaMask
 * this is the object injected into `window.ethereum`.
 *
 * @param chainSpec The full specification of the chain to switch to or add.
 *
 * @returns Object with a single `added` field indicating whether the chain was
 * switched to or added. An exception is thrown if the operation is unsucessful
 * (e.g. the user rejects the request in the wallet).
 */
export async function switchOrAddChain(
	ethereum: ethers.providers.ExternalProvider,
	chainSpec: ChainSpec
) {
	try {
		await switchChain(ethereum, chainSpec.chainId);
		return { added: false };
	} catch (err: any) {
		// 4902 is the not found error code
		if (err.code !== 4902) {
			throw err;
		}
	}
	await addChain(ethereum, chainSpec);
	return { added: true };
}
