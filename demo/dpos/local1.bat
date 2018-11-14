node ./dist/blockchain-sdk/src/tool/host.js miner ^
--genesis "./data/dpos/genesis_local" ^
--dataDir "./data/dpos/miner_storage" ^
--loggerConsole --loggerLevel info ^
--minerSecret 64d8284297f40dc7475b4e53eb72bc052b41bef62fecbd3d12c5e99b623cfc11 ^
--feelimit 1000 ^
--genesisMiner ^
--net standalone %* 
