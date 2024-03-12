import { inspect } from "util";
import { ChainId, tryNativeToHexString } from "@certusone/wormhole-sdk";
import {
  NttManager__factory,
  WormholeTransceiver__factory,
} from "../contract-bindings";
import {
  loadOperatingChains,
  init,
  ChainInfo,
  getSigner,
  getChainConfig,
  getContractAddress,
  loadScriptConfig,
} from "./env";

const processName = "updatePeerAddresses";

type PeerConfig = {
  chainId: ChainId;
  decimals: number;
  inboundLimit: string;
  isWormholeRelayingEnabled: boolean;
  isWormholeEvmChain: boolean;
  isSpecialRelayingEnabled: boolean;

  managerAddress?: string;
  transceiverAddress?: string;
};

init();
const chains = loadOperatingChains();
async function run() {
  // Warning: we assume that the script configuration file is correctly formed
  const config = (await loadScriptConfig("peers")) as PeerConfig[];
  console.log(`Start ${processName}!`);

  const results = await Promise.all(
    chains.map(async (chain) => {
      try {
        await registerPeers(chain, config);
      } catch (error) {
        return { chainId: chain.chainId, error };
      }

      return { chainId: chain.chainId };
    })
  );

  for (const result of results) {
    if ("error" in result) {
      console.error(
        `Error configuring contract for chain ${result.chainId}: ${inspect(
          result.error
        )}`
      );
      continue;
    }

    console.log(`Configuration succeded for chain ${result.chainId}`);
  }
}

async function registerPeers(chain: ChainInfo, peers: PeerConfig[]) {
  const log = (...args: any[]) => console.log(`[${chain.chainId}]`, ...args);

  const managerContract = await getManagerContract(chain);
  const transceiverContract = await getTransceiverContract(chain);

  for (const peer of peers) {
    if (peer.chainId === chain.chainId) continue;

    const config = await getChainConfig<PeerConfig>(processName, peer.chainId);

    if (!config.decimals)
      return {
        chainId: chain.chainId,
        error: "No 'decimals' configuration found",
      };

    const peerCurrentConfig = await managerContract.getPeer(peer.chainId);
    const desiredPeerAddress = await getNormalizedPeerManagerAddress(
      peer,
      chain
    );

    if (!desiredPeerAddress)
      return { chainId: chain.chainId, error: "No 'managerAddress' found" };

    if (
      peerCurrentConfig.peerAddress !== desiredPeerAddress ||
      peerCurrentConfig.tokenDecimals !== config.decimals
    ) {
      await managerContract.setPeer(
        peer.chainId,
        Buffer.from(desiredPeerAddress, "hex"),
        config.decimals,
        BigInt(config.inboundLimit)
      );
      log(
        `Registered manager peer for chain ${peer.chainId} at ${desiredPeerAddress}.`
      );
    } else {
      log(
        `Manager peer for chain ${peer.chainId} already registered at ${peerCurrentConfig.peerAddress}.`
      );
    }

    const currentTransceiverAddr = await transceiverContract.getWormholePeer(
      peer.chainId
    );

    const desiredTransceiverAddr = await getNormalizedPeerTransceiverAddress(
      peer,
      chain
    );

    if (!desiredTransceiverAddr)
      return {
        chainId: chain.chainId,
        error: "No 'transceiverAddress' found",
      };

    if (desiredTransceiverAddr !== currentTransceiverAddr) {
      await transceiverContract.setWormholePeer(
        peer.chainId,
        Buffer.from(desiredTransceiverAddr, "hex")
      );
      log(
        `Registered transceiver peer for chain ${peer.chainId} at ${desiredTransceiverAddr}.`
      );
    } else {
      log(
        `Transceiver peer for chain ${peer.chainId} was already registered at ${currentTransceiverAddr}.`
      );
    }

    if (
      (await transceiverContract.isWormholeEvmChain(peer.chainId)) !==
      peer.isWormholeEvmChain
    ) {
      await transceiverContract.setIsWormholeEvmChain(
        peer.chainId,
        peer.isWormholeEvmChain
      );
      log(
        `Set ${peer.chainId} as wormhole evm chain = ${peer.isWormholeEvmChain}`
      );
    } else {
      log(`Chain ${peer.chainId} is already set as wormhole evm chain.`);
    }

    if (
      (await transceiverContract.isSpecialRelayingEnabled(peer.chainId)) !==
      peer.isSpecialRelayingEnabled
    ) {
      await transceiverContract.setIsSpecialRelayingEnabled(
        peer.chainId,
        peer.isSpecialRelayingEnabled
      );
      log(
        `Set isSpecialRelayingEnabled for chain ${peer.chainId} to ${peer.isSpecialRelayingEnabled}.`
      );
    } else {
      log(
        `isSpecialRelayingEnabled for chain ${peer.chainId} is already set to ${peer.isSpecialRelayingEnabled}.`
      );
    }

    if (
      (await transceiverContract.isWormholeRelayingEnabled(peer.chainId)) !==
      peer.isWormholeRelayingEnabled
    ) {
      await transceiverContract.setIsWormholeRelayingEnabled(
        peer.chainId,
        peer.isWormholeRelayingEnabled
      );
      log(
        `Set isWormholeRelayingEnabled for chain ${peer.chainId} to ${peer.isWormholeRelayingEnabled}.`
      );
    } else {
      log(
        `isWormholeRelayingEnabled for chain ${peer.chainId} is already set to ${peer.isWormholeRelayingEnabled}.`
      );
    }
  }

  return { chainId: chain.chainId };
}

async function getTransceiverContract(chain: ChainInfo) {
  const signer = await getSigner(chain);
  const transceiverAddress = await getContractAddress(
    "NttTransceiverProxies",
    chain.chainId
  );
  return WormholeTransceiver__factory.connect(transceiverAddress, signer);
}

async function getManagerContract(chain: ChainInfo) {
  const signer = await getSigner(chain);
  const managerAddress = await getContractAddress(
    "NttManagerProxies",
    chain.chainId
  );
  return NttManager__factory.connect(managerAddress, signer);
}

async function getNormalizedPeerManagerAddress(
  peer: PeerConfig,
  chain: ChainInfo
) {
  const peerAddress = await getPeerManagerAddress(peer, chain);
  if (!peerAddress) return;
  return tryNativeToHexString(peerAddress, peer.chainId);
}

async function getNormalizedPeerTransceiverAddress(
  peer: PeerConfig,
  chain: ChainInfo
) {
  const peerAddress = await getPeerTransceiverAddress(peer, chain);
  if (!peerAddress) return;
  return tryNativeToHexString(peerAddress, peer.chainId);
}

async function getPeerManagerAddress(peer: PeerConfig, chain: ChainInfo) {
  return (
    peer.managerAddress ??
    (await getContractAddress("NttManagerProxies", peer.chainId))
  );
}

async function getPeerTransceiverAddress(peer: PeerConfig, chain: ChainInfo) {
  return (
    peer.transceiverAddress ??
    (await getContractAddress("NttTransceiverProxies", peer.chainId))
  );
}

run().then(() => console.log("Done!"));
