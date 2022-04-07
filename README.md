[![LivepeerJS](https://user-images.githubusercontent.com/555740/117340053-78210e80-ae6e-11eb-892c-d98085fe6824.png)](https://livepeer.github.io/livepeerjs/)

---
# Video NFT SDK

[![npm](https://img.shields.io/npm/v/@livepeer/video-nft.svg?style=flat-square&color=green)](https://www.npmjs.com/package/@livepeer/video-nft)


SDK for creating Video NFT minting applications.

Also provides a CLI for minting an NFT in 1-command.

## Index

- [Installing](#installing)
- [Documentation](#documentation)
- [Usage](#usage)
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
import videonft from '@livepeer/video-nft'

// To upload files from the filesystem
const uploader = new videonft.minter.Uploader();
// To process videos and export to IPFS
const vodApi = new videonft.minter.Api({ auth: { apiKey } });
// To mint the NFT from the IPFS files
const { chainId } = ethereum
const web3 = new videonft.minter.Web3({ ethereum, chainId });
```

### CDN

We are still working on support for injecting this SDK as a static script from a
CDN. For now we recommend using it as an ES Module as suggested above.

## Documentation

Browse the code [documentation](https://livepeer.github.io/video-nft/) online

 - Continue reading this for [Usage](#usage) and [Examples](#examples)
 - For the NFT minting CLI check [this guide](https://livepeer.com/docs/guides/video-nft)

## Usage

This SDK can be used both from Node.js (like in a backend) as well as the
browser, and is currently best used with the
[Polygon](https://polygon.technology) blockchain. It consists of a couple
different modules which are all included in the `videonft` object.

On the browser-side, it has been thoroughly tested with the MetaMask wallet. It
should work with any other Web3 wallet compatible with MetaMask though.

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

You can use the entire SDK only from the browser. This is useful for hacking
and/or demonstrating an idea, but has some security implications. Anyone with
the proper knowledge will be able to snoop the API key from your code or the
network requests and impersonate you in the Livepeer API.

Being aware of these limitations, you can get started like that anyway. You will
only need to create a CORS-enabled API key in the Livepeer Video Services
dashboard. Check the documentation on [getting an API
key](https://livepeer.com/docs/guides/start-live-streaming/api-key) for more
information.

The code below shows a simple example how the whole flow would look like from
the browser:

```js
import videonft from '@livepeer/video-nft'

const apiOpts = {
  auth: { apiKey: 'your-api-key-here' },
  // defaults to current origin if not specified
  endpoint: prodApiEndpoint
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
process though. You can use it to show some feedback to your user, ask for
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

### Split backend and browser setups

// TO-DO...

## CLI

This project also contains a CLI that uses the SDK and can be used to mint NFTs
from the terminal. All you need is an API key and a file to mint. To run it
directly with `npx`:

```bash
npx @livepeer/video-nft
```

For more information check [this guide](https://livepeer.com/docs/guides/video-nft).

## Contributing

[Pull Requests](https://github.com/livepeer/video-nft/pulls) are always welcome!

Also feel free to open [Issues](https://github.com/livepeer/video-nft/issues)
with bug reports or feature requests. We're glad for any feedback!

## License

MIT
