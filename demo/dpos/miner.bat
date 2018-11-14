node ./dist/blockchain-sdk/src/tool/host.js miner ^
--genesis "./data/dpos/genesis" ^
--dataDir "./data/dpos/miner1" ^
--loggerConsole --loggerLevel debug ^
--minerSecret 64d8284297f40dc7475b4e53eb72bc052b41bef62fecbd3d12c5e99b623cfc11 ^
--rpchost localhost --rpcport 18089 ^
--executor interprocess ^
--genesisMiner ^
--feelimit 100 ^
--netConfig ./demo/dpos/miner.cfg  %* 
