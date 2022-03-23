import { ethers } from 'ethers';

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

export type BuiltinChainInfo = {
	spec: ChainSpec;
	defaultContract: `0x${string}`;
	openseaBaseUrl: string;
	openseaChainName: string;
};

export const builtinChains: Record<string, BuiltinChainInfo> = {
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
		openseaBaseUrl: 'https://opensea.io',
		openseaChainName: 'matic'
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
		openseaBaseUrl: 'https://testnets.opensea.io',
		openseaChainName: 'mumbai'
	}
};

export function switchChain(
	ethereum: ethers.providers.ExternalProvider,
	chainId: string
) {
	if (!ethereum.request) {
		throw new Error('ethereum provider does not support request');
	}
	return ethereum.request({
		method: 'wallet_switchEthereumChain',
		params: [{ chainId }]
	});
}

export function addChain(
	ethereum: ethers.providers.ExternalProvider,
	chainSpec: ChainSpec
) {
	if (!ethereum.request) {
		throw new Error('ethereum provider does not support request');
	}
	return ethereum.request({
		method: 'wallet_addEthereumChain',
		params: [chainSpec]
	});
}

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

export function isChainBuiltin(chainId: string) {
	return !!builtinChains[chainId];
}
