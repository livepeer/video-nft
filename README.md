[![LivepeerJS](https://user-images.githubusercontent.com/555740/117340053-78210e80-ae6e-11eb-892c-d98085fe6824.png)](https://livepeer.github.io/livepeerjs/)

---
# Video NFT SDK

[![npm](https://img.shields.io/npm/v/@livepeer/video-nft.svg?style=flat-square&color=green)](https://www.npmjs.com/package/@livepeer/video-nft)


SDK for creating Video NFT minting applications.

Also provides a CLI for minting an NFT in 1-command.

## Index

- [Installing](#installing)
- [Getting Started](#getting-started)
- [Documentation](#documentation)
- [Usage](#usage)
  - [Smart Contracts](#smart-contracts)
- [Examples](#examples)
- [CLI](#cli)
- [Contributing](#contributing)

## Installing

### Package Managers

#### yarn
```bash
yarn add @livepeer/video-nft
```

#### npm
```bash
npm install @livepeer/video-nft
```

Then the API can then be imported as a regular module:

```js
import { videonft } from '@livepeer/video-nft'

// To upload videos from the filesystem
const uploader = new videonft.minter.Uploader();
// To process videos and export to IPFS
const vodApi = new videonft.minter.Api({ auth: { apiKey } });
// To mint the NFT from the IPFS files
const { chainId } = ethereum
const web3 = new videonft.minter.Web3({ ethereum, chainId });
```

### CDN

Add the following script tag to the header of your HTML file:

```html
<script src="https://unpkg.com/@livepeer/video-nft@0.3.2/dist/index.umd.js"></script>
```

The SDK will be available as a global named `videonft`:

```js
const web3 = new videonft.minter.FullMinter({}, { ethereum, chainId });
```

For more information about using the SDK check the [Usage](#usage) section.

## Getting Started

Check our entry-point guides for getting started with this project:
- [How to Mint a Video NFT](https://livepeer.com/docs/guides/video-nfts/mint-a-video-nft)
- [Build a Video NFT app](https://livepeer.com/docs/guides/video-nfts/build-a-video-nft-app)

## Documentation

Browse the [code
documentation](https://livepeer.github.io/video-nft/modules.html) online.

 - Continue reading this for [Usage](#usage) and [Examples](#examples)
 - [Deploy your own ERC-721 contract](https://lvpr.link/create-erc721)

## Usage

This SDK can be used both from Node.js (like in a backend) as well as the
browser, and is currently best used with the
[Polygon](https://polygon.technology) blockchain. It consists of a couple
different modules which are all included in the `videonft` object.

On the browser-side, it has been thoroughly tested with the MetaMask wallet. It
should work with any other Web3 wallet compatible with MetaMask though.

### Smart Contracts

The SDK provides [built-in
support](https://livepeer.github.io/video-nft/modules/chains.html) for a couple
of chains, specifically [Polygon](https://polygon.io/) mainnet and testnet. This
means that you can get started with the SDK immediately without deploying your
own custom smart contract. That naturally means that we have a [simple smart
contract](https://lvpr.link/video-nft-erc721-src) deployed in these chains which
is used by default to mint the NFTs.

You can override these default contracts by passing your own smart contract
address to the
[`mintNft`](https://livepeer.github.io/video-nft/classes/minter.Web3.html#mintNft)
or
[`createNft`](https://livepeer.github.io/video-nft/classes/minter.FullMinter.html#createNft)
functions. The only requirement is that your smart contract implements the
[required
ABI](https://livepeer.github.io/video-nft/modules/minter.html#videoNftAbi). You
can also use any other chain that we don't have built-in support,
you will only need to provide a custom smart contract every time.

For help creating your own smart contract, follow our [Deploy your own ERC-721
contract](https://lvpr.link/create-erc721) guide.

### Modules

The main module is the
[`videonft.minter`](https://livepeer.github.io/video-nft/modules/minter.html)
which consists of 3 parts:
 - The `Uploader` to send files from the local context (e.g. picked by the user
   on a file picker) to the Livepeer API.
 - The `Api` component, used to interact with the Livepeer API or a proxy to it.
   Abstracts the video-processing and IPFS exporting APIs for preparing the
   video for an NFT.
 - The `Web3` component, used to actually mint the NFT given the IPFS URLs
   obtained from the `Api` component above.

The SDK also provides a couple other modules that can be useful when developing
an NFT-minting application:
 - [`videonft.chains`](https://livepeer.github.io/video-nft/modules/chains.html):
   Provides some utilities for handling different blockchains that the user
   might be connected to. The SDK also has a couple of built-in chains
   (basically Polygon right now) where we have pre-deployed ERC-721 smart
   contracts for minting the NFTs. Check [the
   documentation](https://livepeer.github.io/video-nft/modules/chains.html) for
   more information.
- [`videonft.api`](https://livepeer.github.io/video-nft/modules/api.html): Raw
  client for the Livepeer VOD API. Can be used directly if you need more control
  or use the API in a different way than abstracted by the `minter.Api` helper.
- [`videonft.transcode`](https://livepeer.github.io/video-nft/modules/transcode.html):
  Provides some utilities for determining the parameters of a transcode task to
  be performed with the video asset. It is also abstracted by the `minter.Api`
  component through the `nftNormalize` and `checkNftNormalize` functions.

## Examples

We will focus on the main `minter` module here which provides the higher-level
abstractions for minting an NFT. The module has 3 main parts as shown
[above](#modules), the `Uploader`, `Api` and `Web3`.

You would normally split parts of the logic between your frontend and your
backend for different reasons like security or performance. Let's explore some
of the alternatives here.

### Browser-only

You can do the entire minting flow from the browser. This is the quickest way to
get started, but could have some security implications. Anyone with the proper
knowledge will be able to snoop the API key from your code or network requests
and impersonate you in the Livepeer API.

So it is recommended that you use a CORS-enabled API key with restricted access
to the API. Check the documentation on [getting an API
key](https://livepeer.com/docs/guides/start-live-streaming/api-key) for more
information.

The code below shows a simple example of how the whole flow would look like from
the browser:

```js
import { videonft } from '@livepeer/video-nft'

const apiOpts = {
  auth: { apiKey: 'your-api-key-here' },
  // defaults to current origin if not specified
  endpoint: videonft.api.prodApiEndpoint
};
const chainId = ethereum.chainId; // or await ethereum.request({ method: 'eth_chainId' });
const minter = new videonft.minter.FullMinter(apiOpts, { ethereum, chainId });

// file is optional, will open a file picker if not provided.
async function mintNft(file) {
  const nftInfo = await minter.createNft({
    name: 'My NFT',
    file,
    nftMetadata: {
      description: 'My NFT description',
      traits: { 'my-custom-trait': 'my-custom-value' }
    }
  });
  console.log(`minted NFT on contract ${nftInfo.contractAddress} with ID ${nftInfo.tokenId}`);
  return nftInfo;
}
```

It is common to prefer more control over the individual steps of the minting
process. You can use it to show some feedback to your user and ask for
additional information or confirmation. That same example would look like this:

```ts
async function mintNft() {
  const file = await minter.uploader.pickFile();
  let asset = await minter.api.createAsset('My NFT', file);
  // optional, optimizes the video for the NFT
  asset = await minter.api.nftNormalize(asset);

  const nftMetadata = {
    description: 'My NFT description',
    traits: { 'my-custom-trait': 'my-custom-value' }
  };
  const ipfs = await minter.api.exportToIPFS(asset.id, nftMetadata);
  const tx = await minter.web3.mintNft(ipfs.nftMetadataUrl);
  const nftInfo = await minter.web3.getMintedNftInfo(tx);
  console.log(`minted NFT on contract ${nftInfo.contractAddress} with ID ${nftInfo.tokenId}`);
  return nftInfo;
}
```

### Split backend and browser

If you'd rather have the maximum security for your API key, you can create a
backend to serve as a proxy to the Livepeer API and optionally provide
higher-level abstractions for all the minting operations.

You can even do the entire flow from the backend as well, including the
blockchain transaction via the `Web3` helper. On that case, it would not be your
users doing the minting but you. That means not only you would need to pay for
the gas costs yourself, but your users would also not own the NFTs they mint.

You could circumvent that by immediately transferring the minted NFT to the user
(more gas) or creating a custom contract that allows minting to another address
in the `mint()` call, but the recommended approach here is to just let your
users do the minting themselves. So we suggest you to keep the `Web3` minting
part in the browser, close to your users.

The simplest backend you could make is one that just forwards the calls to the
Livepeer API whilst injecting an API key:

```js
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const app = express();
const proxy = createProxyMiddleware({
	target: 'https://livepeer.com',
	changeOrigin: true,
	headers: {
		authorization: process.env.LP_API_KEY ?? ''
	}
});

app.get('/api/asset/:id', proxy);
app.get('/api/task/:id', proxy);
app.post('/api/asset/request-upload', proxy);
app.post('/api/asset/transcode', proxy);
app.post('/api/asset/:id/export', proxy);

app.listen(3000);
```

By running that backend you can use the same code examples from the
[browser-only](#browser-only) section above. All you need to change is the
`apiOpts` object to remove the `auth` option (since your proxy will be adding
that) and changing the `endpoint` to where your backend is:
 - If your backend is running on the same domain as your frontend, you can
   actually omit the `endpoint` field as well and the client will default to the
   current origin:
```js
const apiOpts = {};
const minter = new videonft.minter.FullMinter(apiOpts, { ethereum, chainId });
```
 - You can also run your backend on a different domain than your frontend.
   You'll likely need some CORS logic or middleware in your backend to support
   the cross-origin request. You can use a package like
   [cors](https://www.npmjs.com/package/cors) for that. On the frontend, you
   only need to add the domain (with the scheme) to the `endpoint` field:
```js
const apiOpts = { endpoint: 'https://backend.example.com' };
const minter = new videonft.minter.FullMinter(apiOpts, { ethereum, chainId });
```

Everything else can be kept the same!

## CLI

This project also contains a CLI that uses the SDK and can be used to mint NFTs
from the terminal. All you need is an API key and a file to mint. To run it
directly with `npx`:

```bash
npx @livepeer/video-nft
```

You can also check the source code of the CLI or the
[livepeer.com/mint-nft](https://livepeer.com/mint-nft) page for further examples
on how to use the SDK:
 - [CLI source](https://github.com/livepeer/video-nft/blob/vg/feat/docs/src/cli/index.ts)
 - [Mint NFT page source](https://github.com/livepeer/livepeer-com/blob/master/packages/www/pages/mint-nft/index.tsx)

For more information using the CLI check [this
guide](https://livepeer.com/docs/guides/video-nft).

## Contributing

[Pull Requests](https://github.com/livepeer/video-nft/pulls) are always welcome!

Also feel free to open [Issues](https://github.com/livepeer/video-nft/issues)
with bug reports or feature requests. We're glad for any feedback!

## License

MIT
